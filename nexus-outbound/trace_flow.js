const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function traceFlow() {
  try {
    console.log('=== USER ROLES & STATUS ===\n');
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, isActive: true }
    });
    
    users.forEach(u => {
      console.log(`${u.email}`);
      console.log(`  Role: ${u.role}`);
      console.log(`  Status: ${u.isActive ? 'ACTIVE' : 'INACTIVE'}`);
    });
    
    console.log('\n=== TEAM STRUCTURE ===\n');
    const teams = await prisma.team.findMany({
      include: {
        teamMembers: {
          include: { user: { select: { email: true } } }
        }
      }
    });
    
    teams.forEach(team => {
      console.log(`Team: ${team.name}`);
      team.teamMembers.forEach(member => {
        console.log(`  - ${member.user.email}`);
      });
    });
    
    console.log('\n=== CAMPAIGNS & OWNERSHIP ===\n');
    const campaigns = await prisma.campaign.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' }
    });
    
    campaigns.forEach(c => {
      console.log(`Campaign: ${c.name}`);
      console.log(`  Owner: ${c.user.email}`);
      console.log(`  Status: ${c.status}`);
      console.log(`  Created: ${c.createdAt.toISOString().split('T')[0]}`);
    });
    
    console.log('\n=== TEST: WHAT EACH USER SHOULD SEE ===\n');
    
    // For master user (monu)
    console.log('MASTER (monu@theboredmonkey.com) should see:');
    const masterUser = users.find(u => u.role === 'MASTER');
    if (masterUser) {
      const masterCampaigns = await prisma.campaign.findMany({
        select: { id: true, name: true, user: { select: { email: true } } }
      });
      console.log(`  ✓ ALL ${masterCampaigns.length} campaigns`);
      masterCampaigns.forEach(c => console.log(`    - ${c.name} (by ${c.user.email})`));
    }
    
    // For team member (snehal)
    console.log('\nTEAM MEMBER (snehal.maurya@theboredmonkey.com) should see:');
    const snehalUser = users.find(u => u.email === 'snehal.maurya@theboredmonkey.com');
    if (snehalUser) {
      // Get teams this user belongs to
      const userTeams = await prisma.userTeam.findMany({
        where: { userId: snehalUser.id },
        select: { teamId: true }
      });
      console.log(`  Belongs to ${userTeams.length} team(s)`);
      
      // Get all users in those teams
      const teamUsers = await prisma.userTeam.findMany({
        where: { teamId: { in: userTeams.map(t => t.teamId) } },
        select: { userId: true, user: { select: { email: true } } },
        distinct: ['userId']
      });
      
      const userIds = [snehalUser.id, ...teamUsers.map(t => t.userId)];
      const visibleCampaigns = await prisma.campaign.findMany({
        where: { userId: { in: userIds } },
        select: { id: true, name: true, user: { select: { email: true } } }
      });
      
      console.log(`  ✓ ${visibleCampaigns.length} campaigns from team + own:`);
      visibleCampaigns.forEach(c => console.log(`    - ${c.name} (by ${c.user.email})`));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

traceFlow();
