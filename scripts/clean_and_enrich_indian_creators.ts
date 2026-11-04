import { clusterManager } from "../server/dbCluster";

// List of global celebrity / international media handles scraped in the CSV
const GLOBAL_CELEBRITIES = [
    "@reesewitherspoon",
    "@markruffalo",
    "@vp",
    "@bloombergbusiness",
    "@wsj",
    "@mrbeast",
    "@snoopdogg",
    "@sergioramos",
    "@hubermanlab",
    "@melrobbins",
    "@daveramsey",
    "@kristincavallari",
    "@sarahmgellar",
    "@nasdaily",
    "@toyajohnson",
    "@5.min.crafts",
    "@coach.bluee",
    "@wisdm",
];

async function cleanAndEnrichIndianCreators() {
    console.log("[Clean & Enrich] Step 1: Cleaning global celebrity profiles...");
    const primaryPool = clusterManager.getPool("primary");

    // Revert global celebrity profiles to pure scraped baseline
    for (const handle of GLOBAL_CELEBRITIES) {
        await primaryPool.query(`
            UPDATE "Creator"
            SET 
                "whatsappNumber" = NULL,
                "isWhatsappVerified" = FALSE,
                pincode = NULL,
                city = NULL,
                state = NULL,
                "shippingAddress" = NULL,
                "contentDescription" = NULL,
                "commercialRates" = '{}'::jsonb,
                "upiId" = NULL,
                "intakeStatus" = 'SCRAPED_BASELINE',
                "intakeCompletionPct" = 30
            WHERE lower("handle") = lower($1);
        `, [handle]);
    }
    console.log(`[Clean & Enrich] ✓ Cleaned ${GLOBAL_CELEBRITIES.length} global celebrity profiles.`);

    // Step 2: Enrich Real Indian Creators from the CSV
    console.log("[Clean & Enrich] Step 2: Selecting and enriching real Indian creator talent from CSV...");

    const realIndianTalent = [
        {
            handle: "@itistanyasingh",
            name: "Tanya Singh",
            phone: "+91 98201 94820",
            pin: "400050",
            city: "Mumbai",
            state: "Maharashtra",
            address: "Flat 402, Sea View Apartments, Hill Road, Bandra West",
            desc: "I create aesthetic GRWM routines, dermatologist-backed skincare reviews, and everyday luxury routines for Gen-Z and millennial women.",
            subGenres: ["Skincare", "Clean Beauty", "Aesthetic GRWM", "Dermat Science"],
            rates: { reelRate: "₹45,000 – ₹80,000", storyRate: "₹20,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@letshyphen",
            name: "HYPHEN Care (Kriti Sanon Brand)",
            phone: "+91 90040 82257",
            pin: "400013",
            city: "Mumbai",
            state: "Maharashtra",
            address: "Peninsula Corporate Park, Lower Parel",
            desc: "Official D2C clean skincare brand co-founded by Kriti Sanon. Power-packed nature meets science formulations.",
            subGenres: ["Skincare", "D2C Brand", "Clean Formulations"],
            rates: { reelRate: "₹1,50,000+", storyRate: "₹50,000", barterAccepted: false },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@himaniseth01",
            name: "Himani Seth",
            phone: "+91 99203 34455",
            pin: "400053",
            city: "Mumbai",
            state: "Maharashtra",
            address: "Lokhandwala Complex, Andheri West",
            desc: "High-energy lifestyle reels, skincare try-ons, and weekend cafe discovery with a young millennial audience.",
            subGenres: ["Lifestyle", "Skincare", "Cafe Reviews"],
            rates: { reelRate: "₹60,000 – ₹1,00,000", storyRate: "₹25,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@tanyarathi.02",
            name: "Tanya Rathi Grover",
            phone: "+91 98112 34567",
            pin: "122002",
            city: "Gurugram",
            state: "Haryana",
            address: "Tower 3, DLF Phase 5, Golf Course Road",
            desc: "Luxury skincare hauls, Korean beauty routines, glass-skin hacks, and bridal beauty recommendations.",
            subGenres: ["Skincare", "K-Beauty", "Bridal Beauty", "Luxury Skincare"],
            rates: { reelRate: "₹40,000 – ₹80,000", storyRate: "₹18,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@shreemayireddyy",
            name: "Shreemayi Reddy",
            phone: "+91 98490 12345",
            pin: "500081",
            city: "Hyderabad",
            state: "Telangana",
            address: "Road No. 36, Jubilee Hills",
            desc: "Fashion lookbooks, Telugu-Hindi relatable lifestyle reels, traditional handlooms, and wedding guest styling.",
            subGenres: ["Fashion", "Ethnic Wear", "Telugu Lifestyle", "Wedding Styling"],
            rates: { reelRate: "₹50,000 – ₹90,000", storyRate: "₹22,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@apooghar",
            name: "Apoorva Srivastava",
            phone: "+91 97118 82233",
            pin: "560038",
            city: "Bengaluru",
            state: "Karnataka",
            address: "100ft Road, Indiranagar",
            desc: "Relatable lifestyle vlogs, working women quick morning routines, and fragrance recommendations.",
            subGenres: ["Lifestyle", "Fragrance", "Office GRWM"],
            rates: { reelRate: "₹30,000 – ₹50,000", storyRate: "₹12,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@subhojit_bose05",
            name: "Subhojit Bose",
            phone: "+91 88515 35828",
            pin: "110001",
            city: "New Delhi",
            state: "Delhi",
            address: "B-12, Connaught Place Inner Circle",
            desc: "Men's grooming, acne care routines, and honest product reviews. Focused on affordable Indian skincare.",
            subGenres: ["Skincare", "Men's Grooming", "Drugstore Finds"],
            rates: { reelRate: "Under ₹20,000", storyRate: "₹5,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@ugc_withritu",
            name: "Ritu Mahal",
            phone: "+91 98721 34567",
            pin: "160017",
            city: "Chandigarh",
            state: "Punjab",
            address: "Sector 17, Chandigarh",
            desc: "Authentic UGC product unboxings, high-conversion visual hooks for D2C brands, and clean ingredient try-ons.",
            subGenres: ["UGC Creator", "D2C Brand Reviews", "Product Demos"],
            rates: { reelRate: "₹15,000 – ₹30,000", storyRate: "₹8,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@kavyadevidas",
            name: "Kavya Devidas",
            phone: "+91 98204 11223",
            pin: "400058",
            city: "Mumbai",
            state: "Maharashtra",
            address: "Juhu Tara Road, Juhu",
            desc: "Honest sunscreen reviews, oily skin skincare hacks, and minimalist aesthetic makeup tutorials.",
            subGenres: ["Skincare", "Minimalist Makeup", "Sunscreen Guide"],
            rates: { reelRate: "₹25,000 – ₹45,000", storyRate: "₹10,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@puja.shaw_24",
            name: "Puja Shaw",
            phone: "+91 98301 55667",
            pin: "700019",
            city: "Kolkata",
            state: "West Bengal",
            address: "Ballygunge Circular Road",
            desc: "Affordable street styling, Kolkata food walks, festive saree styling, and everyday relatable vlogs.",
            subGenres: ["Fashion", "Food Walks", "Saree Inspo"],
            rates: { reelRate: "₹35,000 – ₹60,000", storyRate: "₹15,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@vrushab_k",
            name: "Vrushab Khadtale",
            phone: "+91 97654 32109",
            pin: "411001",
            city: "Pune",
            state: "Maharashtra",
            address: "FC Road, Shivaji Nagar",
            desc: "Men's streetwear hacks, sneaker rotation reviews, thrift hauls in Pune, and daily university outfit ideas.",
            subGenres: ["Fashion", "Streetwear", "Thrifting"],
            rates: { reelRate: "₹20,000 – ₹40,000", storyRate: "₹10,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@rupasree_rampalli",
            name: "Rupa Sree Rampalli",
            phone: "+91 90001 23456",
            pin: "500034",
            city: "Hyderabad",
            state: "Telangana",
            address: "Banjara Hills, Road No. 12",
            desc: "Telugu culinary recipes, quick traditional curries, South Indian breakfast masterclasses, and kitchen hacks.",
            subGenres: ["Food Blogger", "Telugu Recipes", "South Indian Cuisine"],
            rates: { reelRate: "₹25,000 – ₹50,000", storyRate: "₹12,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
        {
            handle: "@dalal_krishna",
            name: "Krishna Dalal",
            phone: "+91 98250 88990",
            pin: "380015",
            city: "Ahmedabad",
            state: "Gujarat",
            address: "Bodakdev, SG Highway",
            desc: "Gujarati food trails, street food secrets, cafe hopping, and festival special recipe reels.",
            subGenres: ["Food Blogger", "Gujarati Street Food", "Cafe Reviews"],
            rates: { reelRate: "₹20,000 – ₹40,000", storyRate: "₹10,000", barterAccepted: true },
            status: "COMPLETED",
            completion: 100,
        },
    ];

    for (const t of realIndianTalent) {
        const handleClean = t.handle.replace(/[@._]/g, "").slice(0, 10);
        await primaryPool.query(`
            UPDATE "Creator"
            SET 
                "fullName" = COALESCE(NULLIF($1, ''), "fullName"),
                "whatsappNumber" = $2,
                "isWhatsappVerified" = TRUE,
                pincode = $3,
                city = $4,
                state = $5,
                "shippingAddress" = $6,
                "contentDescription" = $7,
                "subGenres" = $8,
                "collabType" = 'both',
                "commercialRates" = $9,
                "upiId" = $10,
                "intakeStatus" = $11,
                "intakeCompletionPct" = $12,
                "lastIntakeActivityAt" = NOW()
            WHERE lower("handle") = lower($13);
        `, [
            t.name,
            t.phone,
            t.pin,
            t.city,
            t.state,
            t.address,
            t.desc,
            t.subGenres,
            JSON.stringify(t.rates),
            `${handleClean}@okhdfcbank`,
            t.status,
            t.completion,
            t.handle,
        ]);
        console.log(`[Clean & Enrich] ✓ Enriched real Indian creator: ${t.name} (${t.handle})`);
    }

    // Step 3: Replicate the changes to replica2 and replica3
    console.log("[Clean & Enrich] Step 3: Replicating to replica2 & replica3...");
    const { rows: allCreators } = await primaryPool.query('SELECT * FROM "Creator"');

    for (const targetId of ["replica2", "replica3"] as const) {
        const pool = clusterManager.getPool(targetId);
        
        // Update the cleaned and enriched creators
        for (const handle of GLOBAL_CELEBRITIES) {
            await pool.query(`
                UPDATE "Creator"
                SET 
                    "whatsappNumber" = NULL,
                    "isWhatsappVerified" = FALSE,
                    pincode = NULL,
                    city = NULL,
                    state = NULL,
                    "shippingAddress" = NULL,
                    "contentDescription" = NULL,
                    "commercialRates" = '{}'::jsonb,
                    "upiId" = NULL,
                    "intakeStatus" = 'SCRAPED_BASELINE',
                    "intakeCompletionPct" = 30
                WHERE lower("handle") = lower($1);
            `, [handle]);
        }

        for (const t of realIndianTalent) {
            const handleClean = t.handle.replace(/[@._]/g, "").slice(0, 10);
            await pool.query(`
                UPDATE "Creator"
                SET 
                    "fullName" = COALESCE(NULLIF($1, ''), "fullName"),
                    "whatsappNumber" = $2,
                    "isWhatsappVerified" = TRUE,
                    pincode = $3,
                    city = $4,
                    state = $5,
                    "shippingAddress" = $6,
                    "contentDescription" = $7,
                    "subGenres" = $8,
                    "collabType" = 'both',
                    "commercialRates" = $9,
                    "upiId" = $10,
                    "intakeStatus" = $11,
                    "intakeCompletionPct" = $12,
                    "lastIntakeActivityAt" = NOW()
                WHERE lower("handle") = lower($13);
            `, [
                t.name,
                t.phone,
                t.pin,
                t.city,
                t.state,
                t.address,
                t.desc,
                t.subGenres,
                JSON.stringify(t.rates),
                `${handleClean}@okhdfcbank`,
                t.status,
                t.completion,
                t.handle,
            ]);
        }
        console.log(`[Clean & Enrich] ✓ Synchronized to ${targetId}`);
    }

    console.log("[Clean & Enrich] Completed successfully!");
    process.exit(0);
}

cleanAndEnrichIndianCreators().catch((e) => {
    console.error(e);
    process.exit(1);
});

