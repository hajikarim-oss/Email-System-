const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SMARTLEAD_Q3_STATS_MAP = {
  "lalit@adroitleathers.com": { name: "Lalit", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:07:12.000Z" },
  "akanksha@missmosa.in": { name: "Akanksha", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:09:28.404Z" },
  "jayant@missmosa.in": { name: "Jayant", opens: 3, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:13:33.874Z" },
  "pavneet@athenalifestyle.com": { name: "Pavneet", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:15:40.000Z" },
  "ruchi@baisegaba.com": { name: "Ruchi", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:18:55.184Z" },
  "shubhagata.agrawal@vipbags.com": { name: "Shubhagata", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:21:49.148Z" },
  "sagarika.mukerji@vipbags.com": { name: "Sagarika", opens: 1, clicks: 1, replies: 0, bounces: 0, sent_time: "2026-09-24T08:25:00.000Z" },
  "akash.verma@chokore.com": { name: "Akash", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:28:10.000Z" },
  "saloni.nangia@chokore.com": { name: "Saloni", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:32:42.469Z" },
  "founder@craftandglory.in": { name: "Rohit", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:33:57.194Z" },
  "bqa@deebaco.com": { name: "Surbhi", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:39:38.406Z" },
  "dhriti@ecoright.com": { name: "Dhriti", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:49:17.906Z" },
  "ankit.agarwal@eumeworld.com": { name: "Ankit", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:51:30.574Z" },
  "brand@eumeworld.com": { name: "Rishon", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:55:47.226Z" },
  "pranay@eumeworld.com": { name: "Aakash", opens: 3, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T08:57:39.199Z" },
  "laksheeta@fizzygoblet.com": { name: "Laksheeta", opens: 2, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:07:11.839Z" },
  "noyonika@fizzygoblet.com": { name: "Noyonika", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:10:09.202Z" },
  "shanu@fizzygoblet.com": { name: "Shanu", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:13:14.365Z" },
  "barkhaa@greendigo.com": { name: "Barkhaa", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:15:47.622Z" },
  "gilshop@growmore.in": { name: "Vivek", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:19:07.259Z" },
  "tanisha.rungta@hexafunstyles.com": { name: "Tanisha", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:25:14.784Z" },
  "harshit@hexafunstyles.com": { name: "Harshit", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:27:35.062Z" },
  "darshan@inertiacart.com": { name: "Darshan", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:31:58.068Z" },
  "deepa@ishqme.com": { name: "Deepa", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:33:29.143Z" },
  "mrinal@kadamhaat.com": { name: "Mrinal", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:39:28.985Z" },
  "aman@kicksmachine.com": { name: "Aman", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:43:09.847Z" },
  "apoorv@kicksmachine.com": { name: "Apoorv", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:45:35.807Z" },
  "yuktie@kosha.co": { name: "Yuktie", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:49:30.713Z" },
  "pranjul@limeroad.com": { name: "Pranjul", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:51:49.359Z" },
  "latika@limeroad.com": { name: "Latika", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:54:57.411Z" },
  "ankita@limeroad.com": { name: "Ankita", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:57:28.516Z" },
  "saurabh.ahuja@limeroad.com": { name: "Saurabh", opens: 2, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T10:02:14.522Z" },
  "akanksha.gulati@vmartretail.com": { name: "Akanksha", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T10:03:53.104Z" },
  "akshat.jangotra@louisstitch.com": { name: "Akshat", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T10:13:18.108Z" },
  "ishit@ludic.life": { name: "Ishit", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T10:15:41.434Z" },
  "rajashvi@masayahome.com": { name: "Rajashvi", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T10:21:47.778Z" },
  "dhruv@nandiniwest.com": { name: "Dhruv", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T10:25:19.258Z" },
  "sushant.garg@miraggiolife.com": { name: "Sushant", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T10:27:48.295Z" },
  "contact@baggit.com": { name: "Contact", opens: 0, clicks: 0, replies: 0, bounces: 1, sent_time: "2026-09-24T08:16:00.000Z" },
  "info@alamode.in": { name: "Info", opens: 0, clicks: 0, replies: 0, bounces: 1, sent_time: "2026-09-24T08:17:00.000Z" },
  "care@vipbags.com": { name: "Support", opens: 0, clicks: 0, replies: 0, bounces: 1, sent_time: "2026-09-24T08:22:00.000Z" },
  "sales@athenalifestyle.com": { name: "Sales", opens: 0, clicks: 0, replies: 0, bounces: 1, sent_time: "2026-09-24T08:23:00.000Z" },
  "hrishita@fgear.in": { name: "Hrishita", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:03:36.744Z" },
  "zechariah.pereira@drbatras.com": { name: "Zechariah", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:35:00.000Z" },
  "zishaan.z@libertyshoes.com": { name: "Zishaan", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:36:00.000Z" },
  "zubin.mehta@iciciprulife.com": { name: "Zubin", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:37:00.000Z" },
  "zkhurshid@foreverliving.com": { name: "Zaid", opens: 0, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:38:00.000Z" },
  "zuhair@madaboutdigital.co.in": { name: "Zuhair", opens: 1, clicks: 0, replies: 0, bounces: 0, sent_time: "2026-09-24T09:40:00.000Z" },
};

async function checkMissing() {
  const dispatched = await prisma.lead.findMany({
    where: { campaignId: "cmp_1790233732719_dvlj", totalOutbound: { gt: 0 } },
    select: { email: true }
  });
  const inDb = new Set(dispatched.map(l => l.email.toLowerCase()));
  const missing = Object.keys(SMARTLEAD_Q3_STATS_MAP).filter(e => !inDb.has(e.toLowerCase()));
  console.log("Missing dispatched leads from Q3 campaign:", missing);

  // Check if they are in DB without campaignId
  for (const m of missing) {
    const l = await prisma.lead.findFirst({ where: { email: m.toLowerCase() } });
    console.log(m, "in DB?", l ? { id: l.id, campaignId: l.campaignId } : "NOT IN DB");
    if (l) {
      await prisma.lead.update({
        where: { id: l.id },
        data: {
          campaignId: "cmp_1790233732719_dvlj",
          totalOutbound: 1,
          lastSender: "vatsal.vadecha@theboredmonkey.com",
          lastContactedAt: new Date(SMARTLEAD_Q3_STATS_MAP[m].sent_time),
          openCount: SMARTLEAD_Q3_STATS_MAP[m].opens,
          clickCount: SMARTLEAD_Q3_STATS_MAP[m].clicks,
          bounceCount: SMARTLEAD_Q3_STATS_MAP[m].bounces,
          status: "ACTIVE"
        }
      });
    }
  }

  // If we added missing back into campaign, re-check total and trim pending if needed to stay at 1785
  const count = await prisma.lead.count({ where: { campaignId: "cmp_1790233732719_dvlj" } });
  if (count > 1785) {
    const pendingToRemove = await prisma.lead.findMany({
      where: { campaignId: "cmp_1790233732719_dvlj", totalOutbound: 0 },
      take: count - 1785,
      select: { id: true }
    });
    await prisma.lead.updateMany({
      where: { id: { in: pendingToRemove.map(p => p.id) } },
      data: { campaignId: null }
    });
  }

  const finalCount = await prisma.lead.count({ where: { campaignId: "cmp_1790233732719_dvlj" } });
  const finalSent = await prisma.lead.count({ where: { campaignId: "cmp_1790233732719_dvlj", totalOutbound: { gt: 0 } } });
  console.log(`Final: Total = ${finalCount}, Dispatched = ${finalSent}, Pending = ${finalCount - finalSent}`);

  await prisma.$disconnect();
}

checkMissing().catch(e => { console.error(e); prisma.$disconnect(); });
