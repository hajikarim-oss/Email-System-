import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only MASTER can list all users
    const userRole = (session.user as any).role;
    if (userRole !== "MASTER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        mailboxes: {
          select: {
            id: true,
            senderEmail: true,
            status: true,
            providerMailboxId: true,
          },
        },
      },
    });

    const formatted = users.map((u) => ({
      id: u.id,
      name: u.name || u.email.split("@")[0],
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      mailboxes: u.mailboxes,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only MASTER can create/update users
    const userRole = (session.user as any).role;
    if (userRole !== "MASTER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, email, role = "TEAM_MEMBER", smartleadApiKey } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email address required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: { name: name || existing.name, isActive: true, role, smartleadApiKey: smartleadApiKey || existing.smartleadApiKey },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: name || normalizedEmail.split("@")[0].replace(".", " "),
          email: normalizedEmail,
          role,
          isActive: true,
          smartleadApiKey: smartleadApiKey || null,
        },
      });
    }

    const existingMailbox = await prisma.mailbox.findUnique({
      where: { senderEmail: normalizedEmail },
    });

    let mailboxLinked = false;
    if (!existingMailbox) {
      const mailbox = await prisma.mailbox.create({
        data: {
          userId: user.id,
          senderEmail: normalizedEmail,
          provider: "smartlead",
          status: "ACTIVE",
          dailySendLimit: 50,
          warmupStartAt: new Date(),
          warmupTargetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      if (smartleadApiKey) {
        try {
          const baseUrl = process.env.SMARTLEAD_API_URL || "https://server.smartlead.ai/api/v1";
          const slRes = await fetch(`${baseUrl}/email-accounts?api_key=${smartleadApiKey}`);
          const slAccounts = await slRes.json();
          if (Array.isArray(slAccounts)) {
            for (const account of slAccounts) {
              const slEmail = account.from_email || account.username || account.email;
              const slId = String(account.id);
              if (slEmail === normalizedEmail) {
                await prisma.mailbox.update({
                  where: { id: mailbox.id },
                  data: { providerMailboxId: slId, status: "ACTIVE" },
                });
                mailboxLinked = true;
                break;
              }
            }
          }
        } catch (e) {
          console.warn("Smartlead sync failed for new user:", e);
        }
      }
    } else if (smartleadApiKey && !existingMailbox.providerMailboxId) {
      try {
        const baseUrl = process.env.SMARTLEAD_API_URL || "https://server.smartlead.ai/api/v1";
        const slRes = await fetch(`${baseUrl}/email-accounts?api_key=${smartleadApiKey}`);
        const slAccounts = await slRes.json();
        if (Array.isArray(slAccounts)) {
          for (const account of slAccounts) {
            const slEmail = account.from_email || account.username || account.email;
            const slId = String(account.id);
            if (slEmail === normalizedEmail) {
              await prisma.mailbox.update({
                where: { id: existingMailbox.id },
                data: { providerMailboxId: slId, status: "ACTIVE" },
              });
              mailboxLinked = true;
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Smartlead sync failed for existing mailbox:", e);
      }
    } else if (existingMailbox?.providerMailboxId) {
      mailboxLinked = true;
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      mailboxLinked,
      message: mailboxLinked
        ? `User added and mailbox linked to Smartlead!`
        : `User account added${smartleadApiKey ? " (Smartlead sync pending)" : ""}`,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
