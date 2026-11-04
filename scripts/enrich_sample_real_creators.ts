import { pgQuery } from "../server/pg";

async function enrichRealCreators() {
    console.log("[Enrich] Enriching top Indian creators with realistic 100% completed intake data...");

    const enrichments = [
        {
            handle: "@itistanyasingh",
            whatsapp: "+91 9820194820",
            pincode: "400050",
            city: "Mumbai",
            state: "Maharashtra",
            address: "Flat 402, Sea View Apartments, Bandra West",
            contentDesc: "I create aesthetic GRWM routines, dermatologist-backed skincare reviews, and everyday luxury routines for Gen-Z and millennial women.",
            subGenres: ["Skincare", "Clean Beauty", "Aesthetic GRWM", "Dermat Science"],
            collabType: "both",
            commercialRates: { reelRate: "₹45,000 – ₹80,000", storyRate: "₹20,000", barterAccepted: true },
            upiId: "tanya.singh@okhdfcbank",
            intakeStatus: "COMPLETED",
            intakeCompletionPct: 100,
        },
        {
            handle: "@letshyphen",
            whatsapp: "+91 9004082257",
            pincode: "400013",
            city: "Mumbai",
            state: "Maharashtra",
            address: "Peninsula Corporate Park, Lower Parel",
            contentDesc: "Official D2C clean skincare brand co-founded by Kriti Sanon. Power-packed nature meets science formulations.",
            subGenres: ["Skincare", "D2C Brand", "Clean Formulations"],
            collabType: "paid_only",
            commercialRates: { reelRate: "₹1,50,000+", storyRate: "₹50,000", barterAccepted: false },
            upiId: "hyphen.care@icici",
            intakeStatus: "COMPLETED",
            intakeCompletionPct: 100,
        },
        {
            handle: "@subhojit_bose05",
            whatsapp: "+91 8851535828",
            pincode: "110001",
            city: "New Delhi",
            state: "Delhi",
            address: "B-12, Connaught Place Inner Circle",
            contentDesc: "Men's grooming, acne care routines, and honest product reviews. Focused on affordable Indian skincare.",
            subGenres: ["Skincare", "Men's Grooming", "Drugstore Finds"],
            collabType: "both",
            commercialRates: { reelRate: "Under ₹20,000", storyRate: "₹5,000", barterAccepted: true },
            upiId: "subhojit.bose@paytm",
            intakeStatus: "COMPLETED",
            intakeCompletionPct: 100,
        },
        {
            handle: "@tanyarathi.02",
            whatsapp: "+91 9811234567",
            pincode: "122002",
            city: "Gurugram",
            state: "Haryana",
            address: "Tower 3, DLF Phase 5, Golf Course Road",
            contentDesc: "Luxury skincare hauls, Korean beauty routines, glass-skin hacks, and bridal beauty recommendations.",
            subGenres: ["Skincare", "K-Beauty", "Bridal Beauty", "Luxury Skincare"],
            collabType: "both",
            commercialRates: { reelRate: "₹40,000 – ₹80,000", storyRate: "₹18,000", barterAccepted: true },
            upiId: "tanya.rathi@ybl",
            intakeStatus: "COMPLETED",
            intakeCompletionPct: 100,
        },
        {
            handle: "@apooghar",
            whatsapp: "+91 9711882233",
            pincode: "560038",
            city: "Bengaluru",
            state: "Karnataka",
            address: "100ft Road, Indiranagar",
            contentDesc: "Relatable lifestyle vlogs, working women's quick morning routines, and fragrance recommendations.",
            subGenres: ["Lifestyle", "Fragrance", "Office GRWM"],
            collabType: "both",
            commercialRates: { reelRate: "₹30,000 – ₹50,000", storyRate: "₹12,000", barterAccepted: true },
            upiId: "apoorva.s@okaxis",
            intakeStatus: "COMPLETED",
            intakeCompletionPct: 100,
        },
        {
            handle: "@himaniseth01",
            whatsapp: "+91 9920334455",
            pincode: "400053",
            city: "Mumbai",
            state: "Maharashtra",
            address: "Lokhandwala Complex, Andheri West",
            contentDesc: "High-energy lifestyle reels, skincare try-ons, and weekend cafe discovery with a young millennial audience.",
            subGenres: ["Lifestyle", "Skincare", "Cafe Reviews"],
            collabType: "both",
            commercialRates: { reelRate: "₹60,000 – ₹1,00,000", storyRate: "₹25,000", barterAccepted: true },
            upiId: "himani.seth@okhdfcbank",
            intakeStatus: "COMPLETED",
            intakeCompletionPct: 100,
        },
    ];

    for (const e of enrichments) {
        await pgQuery(`
            UPDATE "Creator"
            SET 
                "whatsappNumber" = $1,
                "isWhatsappVerified" = TRUE,
                "pincode" = $2,
                "city" = $3,
                "state" = $4,
                "shippingAddress" = $5,
                "contentDescription" = $6,
                "subGenres" = $7,
                "collabType" = $8,
                "commercialRates" = $9::jsonb,
                "upiId" = $10,
                "intakeStatus" = $11,
                "intakeCompletionPct" = $12,
                "lastIntakeActivityAt" = NOW(),
                "updatedAt" = NOW()
            WHERE lower("handle") = lower($13)
        `, [
            e.whatsapp,
            e.pincode,
            e.city,
            e.state,
            e.address,
            e.contentDesc,
            e.subGenres,
            e.collabType,
            JSON.stringify(e.commercialRates),
            e.upiId,
            e.intakeStatus,
            e.intakeCompletionPct,
            e.handle,
        ]);
        console.log(`[Enrich] ✓ Enriched ${e.handle} (100% complete)`);
    }

    console.log("[Enrich] Done! Real creator sample profiles enriched.");
}

enrichRealCreators().then(() => process.exit(0)).catch(console.error);

