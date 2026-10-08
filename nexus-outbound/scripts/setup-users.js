/**
 * Setup Script: Create Master and Team Members
 *
 * This script creates users with secure password hashing using scrypt
 * - Master user: monu@theboredmonkey.com
 * - Team members: snehal.maurya@theboredmonkey.com, vatsal.vadecha@theboredmonkey.com
 *
 * Passwords are hashed using scrypt (Node.js crypto, no external dependencies)
 * Format: scrypt$N$r$p$salt$hash
 */

const crypto = require('crypto');
const { promisify } = require('util');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const scrypt = promisify(crypto.scrypt);

// Scrypt parameters (same as in server/auth.ts)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

/**
 * Hash password using scrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password in format: scrypt$N$r$p$salt$hash
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const derived = await scrypt(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('base64')}`;
}

/**
 * Setup users and team structure
 */
async function setupUsers() {
  console.log('🔐 Starting secure user setup...\n');

  try {
    // Define users
    const users = [
      {
        email: 'monu@theboredmonkey.com',
        password: '9538564601Aa',
        name: 'Monu',
        role: 'MASTER'
      },
      {
        email: 'snehal.maurya@theboredmonkey.com',
        password: '9538564601Aa',
        name: 'Snehal Maurya',
        role: 'TEAM_MEMBER'
      },
      {
        email: 'vatsal.vadecha@theboredmonkey.com',
        password: '9538564601Aa',
        name: 'Vatsal Vadecha',
        role: 'TEAM_MEMBER'
      }
    ];

    console.log('📝 Hashing passwords (this may take a moment)...\n');

    // Hash passwords for all users
    const usersWithHashedPasswords = await Promise.all(
      users.map(async (user) => {
        const hashedPassword = await hashPassword(user.password);
        return { ...user, hashedPassword };
      })
    );

    console.log('✅ Passwords hashed successfully\n');

    // Create or update users
    console.log('👥 Creating users...\n');
    const createdUsers = {};

    for (const user of usersWithHashedPasswords) {
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email }
      });

      let createdUser;
      if (existingUser) {
        console.log(`  ⚠️  ${user.email} already exists, updating...`);
        createdUser = await prisma.user.update({
          where: { email: user.email },
          data: {
            password: user.hashedPassword,
            role: user.role,
            name: user.name,
            isActive: true
          }
        });
        console.log(`     ✅ Updated: ${user.name} (${user.role})\n`);
      } else {
        console.log(`  ✨ Creating ${user.name}...`);
        createdUser = await prisma.user.create({
          data: {
            email: user.email,
            password: user.hashedPassword,
            name: user.name,
            role: user.role,
            isActive: true
          }
        });
        console.log(`     ✅ Created: ${user.name} (${user.role})\n`);
      }

      createdUsers[user.email] = createdUser;
    }

    // Create team and assign team members
    console.log('👥 Setting up team...\n');

    try {
      let team = await prisma.team.findFirst({
        where: { name: "Snehal's Team" }
      });

      if (team) {
        console.log('  ⚠️  Team "Snehal\'s Team" already exists');
      } else {
        console.log('  ✨ Creating team "Snehal\'s Team"...');
        team = await prisma.team.create({
          data: {
            name: "Snehal's Team",
            description: "Cold email campaign team"
          }
        });
        console.log(`     ✅ Created team: ${team.name}\n`);
      }

      // Assign team members to team (snehal and vatsal)
      const snehalUser = createdUsers['snehal.maurya@theboredmonkey.com'];
      const vatsalUser = createdUsers['vatsal.vadecha@theboredmonkey.com'];

      if (snehalUser && team) {
        const snehalMembership = await prisma.userTeam.findUnique({
          where: {
            userId_teamId: {
              userId: snehalUser.id,
              teamId: team.id
            }
          }
        });

        if (snehalMembership) {
          console.log(`  ✓ Snehal Maurya already in team`);
        } else {
          console.log('  ✨ Adding Snehal Maurya to team...');
          await prisma.userTeam.create({
            data: {
              userId: snehalUser.id,
              teamId: team.id
            }
          });
          console.log('     ✅ Assigned: Snehal Maurya\n');
        }
      }

      if (vatsalUser && team) {
        const vatsalMembership = await prisma.userTeam.findUnique({
          where: {
            userId_teamId: {
              userId: vatsalUser.id,
              teamId: team.id
            }
          }
        });

        if (vatsalMembership) {
          console.log(`  ✓ Vatsal Vadecha already in team`);
        } else {
          console.log('  ✨ Adding Vatsal Vadecha to team...');
          await prisma.userTeam.create({
            data: {
              userId: vatsalUser.id,
              teamId: team.id
            }
          });
          console.log('     ✅ Assigned: Vatsal Vadecha\n');
        }
      }
    } catch (teamError) {
      console.log('  ℹ️  Team setup skipped:', teamError.message);
    }

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SETUP COMPLETE - User Configuration Summary');
    console.log('='.repeat(60) + '\n');

    console.log('👑 MASTER USER:');
    console.log('  Email:    monu@theboredmonkey.com');
    console.log('  Password: 9538564601Aa');
    console.log('  Role:     MASTER');
    console.log('  Access:   All campaigns across all teams\n');

    console.log('👥 TEAM MEMBERS:');
    console.log('  Team: "Snehal\'s Team"\n');
    console.log('  1. Email:    snehal.maurya@theboredmonkey.com');
    console.log('     Password: 9538564601Aa');
    console.log('     Role:     TEAM_MEMBER');
    console.log('     Access:   Team campaigns + own campaigns\n');
    console.log('  2. Email:    vatsal.vadecha@theboredmonkey.com');
    console.log('     Password: 9538564601Aa');
    console.log('     Role:     TEAM_MEMBER');
    console.log('     Access:   Team campaigns + own campaigns\n');

    console.log('🔐 SECURITY NOTES:');
    console.log('  ✓ Passwords hashed with scrypt (Node.js crypto)');
    console.log('  ✓ No plain text passwords stored in database');
    console.log('  ✓ Salt randomly generated per user');
    console.log('  ✓ Format: scrypt$16384$8$1$salt$hash\n');

    console.log('✨ READY FOR TESTING:');
    console.log('  1. Login to http://localhost:5173');
    console.log('  2. Test Master login: monu@theboredmonkey.com');
    console.log('  3. Test Team member: snehal.maurya@theboredmonkey.com');
    console.log('  4. Verify team visibility working\n');

    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error during setup:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run setup
setupUsers();
