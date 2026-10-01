// One-time password migration / reset.
//
// server/auth.ts stores scrypt hashes (scrypt$N$r$p$salt$hash) and refuses
// legacy bcrypt rows, so any pre-existing account must be converted once:
//
//   node scripts/set-password.js <email> <password>
//
// It also revokes that user's existing sessions so the new credential is the
// only way in. Reads DATABASE_URL from web/.env.local, web/.env,
// nexus-outbound/.env or the environment.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");

function loadDatabaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const candidates = [
        path.join(ROOT, "web", ".env.local"),
        path.join(ROOT, "web", ".env"),
        path.join(ROOT, "nexus-outbound", ".env"),
        path.join(ROOT, ".env"),
    ];
    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        const line = fs
            .readFileSync(file, "utf-8")
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("DATABASE_URL="));
        if (line) return line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "").trim();
    }
    throw new Error("DATABASE_URL not found in environment or .env files");
}

function scryptHash(password) {
    const salt = crypto.randomBytes(16).toString("base64");
    const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    return `scrypt$16384$8$1$${salt}$${derived.toString("base64")}`;
}

async function main() {
    const [email, password] = process.argv.slice(2);
    if (!email || !password) {
        console.error("usage: node scripts/set-password.js <email> <password>");
        process.exit(1);
    }
    if (password.length < 8) {
        console.error("password must be at least 8 characters");
        process.exit(1);
    }

    process.env.DATABASE_URL = loadDatabaseUrl();
    const { PrismaClient } = require(path.join(ROOT, "nexus-outbound", "node_modules", "@prisma", "client"));
    const prisma = new PrismaClient();

    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    if (!user) {
        console.error(`no user with email ${email}`);
        await prisma.$disconnect();
        process.exit(1);
    }

    const hash = scryptHash(password);
    await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { password: hash } }),
        prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    await prisma.$disconnect();
    console.log(`updated ${user.role} ${user.email} (password -> scrypt, sessions revoked)`);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
