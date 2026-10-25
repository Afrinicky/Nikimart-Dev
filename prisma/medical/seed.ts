/**
 * Seed the medical database.
 *
 * Idempotent: everything upserts on a natural key, so this can be run against
 * a database that already has data without duplicating a category or resetting
 * a price somebody has since changed by hand. Run it after a migration, run it
 * twice, run it on a database with live orders in it — none of those should
 * do damage.
 *
 * What it writes is a starting catalogue, not demonstration data dressed up as
 * a real one. The products are things a Ghanaian laboratory supplier would
 * actually stock, the prices are plausible GH₵ figures, and the stock figures
 * are modest. Nothing in here invents a sales history, a customer count or a
 * review: a dashboard that opens on fabricated numbers is a dashboard nobody
 * can ever trust again.
 *
 *   npm run medical:seed
 */

import { PrismaClient } from ".prisma/medical-client";

const db = new PrismaClient();

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

interface CategorySeed {
  slug: string;
  name: string;
  description: string;
  icon: string;
  children?: { slug: string; name: string }[];
}

const CATEGORIES: CategorySeed[] = [
  {
    slug: "laboratory-reagents",
    name: "Laboratory reagents",
    description:
      "Clinical chemistry, haematology and staining reagents, supplied in the pack sizes laboratories actually run.",
    icon: "FlaskConical",
    children: [
      { slug: "clinical-chemistry-reagents", name: "Clinical chemistry reagents" },
      { slug: "stains-and-dyes", name: "Stains and dyes" },
      { slug: "buffers-and-solutions", name: "Buffers and solutions" },
    ],
  },
  {
    slug: "laboratory-consumables",
    name: "Laboratory consumables",
    description: "The things a bench goes through: slides, tips, tubes, gloves and containers.",
    icon: "Beaker",
    children: [
      { slug: "slides-and-coverslips", name: "Slides and coverslips" },
      { slug: "pipette-tips", name: "Pipette tips" },
      { slug: "specimen-containers", name: "Specimen containers" },
    ],
  },
  {
    slug: "microbiology",
    name: "Microbiology supplies",
    description: "Culture media, plates, swabs, loops and susceptibility discs.",
    icon: "Microscope",
    children: [
      { slug: "culture-media", name: "Culture media" },
      { slug: "swabs-and-loops", name: "Swabs and loops" },
    ],
  },
  {
    slug: "haematology-and-chemistry",
    name: "Haematology and clinical chemistry",
    description: "Controls, calibrators, cuvettes and the consumables analysers run on.",
    icon: "Droplets",
    children: [
      { slug: "controls-and-calibrators", name: "Controls and calibrators" },
      { slug: "analyser-consumables", name: "Analyser consumables" },
    ],
  },
  {
    slug: "diagnostic-kits",
    name: "Diagnostic kits and rapid tests",
    description: "Rapid test cassettes and kits for infectious disease, pregnancy and screening.",
    icon: "TestTubes",
    children: [
      { slug: "infectious-disease-tests", name: "Infectious disease tests" },
      { slug: "screening-tests", name: "Screening tests" },
    ],
  },
  {
    slug: "blood-collection",
    name: "Blood collection supplies",
    description: "Vacuum tubes, needles, holders, lancets and tourniquets.",
    icon: "Syringe",
  },
  {
    slug: "medical-consumables",
    name: "General medical consumables",
    description: "Syringes, dressings, gauze, plasters and everything a treatment room uses daily.",
    icon: "Bandage",
  },
  {
    slug: "laboratory-equipment",
    name: "Diagnostic and laboratory equipment",
    description:
      "Microscopes, centrifuges, incubators and analysers. Priced on request, with installation and training where it applies.",
    icon: "Activity",
    children: [
      { slug: "microscopes", name: "Microscopes" },
      { slug: "centrifuges", name: "Centrifuges" },
      { slug: "analysers", name: "Analysers" },
    ],
  },
  {
    slug: "hospital-equipment",
    name: "Hospital equipment",
    description: "Patient monitoring, diagnostics and ward equipment.",
    icon: "HeartPulse",
  },
  {
    slug: "surgical-instruments",
    name: "Surgical instruments",
    description: "Stainless steel instruments and sets for theatre, minor procedures and dissection.",
    icon: "Scissors",
  },
  {
    slug: "personal-protective-equipment",
    name: "Personal protective equipment",
    description: "Gloves, masks, gowns, eye protection and footwear.",
    icon: "ShieldCheck",
  },
  {
    slug: "laboratory-furniture",
    name: "Laboratory furniture and accessories",
    description: "Racks, stands, trolleys, stools and bench accessories.",
    icon: "Ruler",
  },
];

// ---------------------------------------------------------------------------
// Manufacturers
// ---------------------------------------------------------------------------

const MANUFACTURERS = [
  { slug: "accralab", name: "AccraLab", country: "Ghana" },
  { slug: "meridian-diagnostics", name: "Meridian Diagnostics", country: "India" },
  { slug: "hexachem", name: "Hexachem", country: "Germany" },
  { slug: "sunrise-medical-supplies", name: "Sunrise Medical Supplies", country: "China" },
  { slug: "vitalon", name: "Vitalon", country: "United Kingdom" },
];

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

interface ProductSeed {
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  manufacturer?: string;
  catalogueNumber: string;
  sku: string;
  packSize: string;
  unitOfSale: string;
  unitsPerPack?: number;
  /** GH₵, as a decimal string. Never a float literal. */
  price: string;
  comparePrice?: string;
  /** Internal. Never leaves the admin boundary. */
  purchaseCost: string;
  purchaseMode: "CHECKOUT" | "QUOTATION" | "BOTH";
  stockOnHand: number;
  reorderLevel?: number;
  allowBackorder?: boolean;
  tracksBatches?: boolean;
  leadTime?: [number, number];
  storageCondition?: string;
  handlingNotes?: string;
  requiresColdChain?: boolean;
  restrictedSale?: boolean;
  restrictionNote?: string;
  sourcingMode?: "LOCAL" | "IMPORT" | "BOTH";
  specifications?: [string, string][];
  compatibleWith?: string[];
  /** A file in public/medical/products, without the extension. */
  image?: string;
  imageAlt?: string;
  isFeatured?: boolean;
  isNewArrival?: boolean;
  searchTerms?: string;
}

const PRODUCTS: ProductSeed[] = [
  {
    slug: "glucose-god-pap-liquid-reagent-4x100ml",
    name: "Glucose (GOD-PAP) liquid reagent",
    summary: "Ready-to-use enzymatic colorimetric reagent for serum and plasma glucose.",
    description:
      "A liquid-stable, ready-to-use reagent for the determination of glucose in serum, plasma and cerebrospinal fluid by the glucose oxidase / peroxidase method. Supplied as four 100 mL bottles with a separate standard. Suitable for manual work and for semi-automated analysers.",
    category: "clinical-chemistry-reagents",
    manufacturer: "hexachem",
    catalogueNumber: "HX-GLU-4100",
    sku: "NMD-RGT-0001",
    packSize: "4 × 100 mL",
    unitOfSale: "kit",
    price: "428.00",
    purchaseCost: "281.50",
    purchaseMode: "BOTH",
    stockOnHand: 34,
    reorderLevel: 8,
    tracksBatches: true,
    leadTime: [2, 4],
    storageCondition: "REFRIGERATED",
    handlingNotes: "Store at 2–8 °C. Do not freeze. Stable to the expiry date on the vial.",
    requiresColdChain: true,
    sourcingMode: "IMPORT",
    specifications: [
      ["Method", "GOD-PAP, endpoint"],
      ["Wavelength", "500 nm (480–520 nm)"],
      ["Sample", "Serum, plasma, CSF"],
      ["Linearity", "Up to 500 mg/dL"],
      ["On-board stability", "30 days at 2–8 °C"],
    ],
    compatibleWith: ["Semi-automated photometers", "Open-channel chemistry analysers"],
    image: "reagent-bottles",
    imageAlt: "Four amber glass reagent bottles with white screw caps, standing in a row",
    isFeatured: true,
    searchTerms: "glucose sugar blood sugar GOD PAP chemistry reagent",
  },
  {
    slug: "total-cholesterol-chod-pap-reagent-2x50ml",
    name: "Total cholesterol (CHOD-PAP) reagent",
    summary: "Enzymatic colorimetric reagent for total cholesterol in serum and plasma.",
    description:
      "Liquid-stable reagent for the quantitative determination of total cholesterol by the CHOD-PAP method. Two 50 mL bottles with standard.",
    category: "clinical-chemistry-reagents",
    manufacturer: "hexachem",
    catalogueNumber: "HX-CHO-250",
    sku: "NMD-RGT-0002",
    packSize: "2 × 50 mL",
    unitOfSale: "kit",
    price: "296.00",
    purchaseCost: "193.00",
    purchaseMode: "BOTH",
    stockOnHand: 18,
    reorderLevel: 6,
    tracksBatches: true,
    leadTime: [2, 4],
    storageCondition: "REFRIGERATED",
    handlingNotes: "Store at 2–8 °C. Protect from light.",
    requiresColdChain: true,
    sourcingMode: "IMPORT",
    specifications: [
      ["Method", "CHOD-PAP, endpoint"],
      ["Wavelength", "500 nm"],
      ["Linearity", "Up to 750 mg/dL"],
    ],
    searchTerms: "cholesterol lipid profile CHOD PAP",
  },
  {
    slug: "giemsa-stain-solution-500ml",
    name: "Giemsa stain solution",
    summary: "Ready-to-dilute Giemsa for malaria films and differential staining.",
    description:
      "Concentrated Giemsa stain in methanol, for thick and thin blood films, bone marrow smears and differential counts. Dilute with buffered water before use.",
    category: "stains-and-dyes",
    manufacturer: "hexachem",
    catalogueNumber: "HX-GIE-500",
    sku: "NMD-RGT-0010",
    packSize: "500 mL bottle",
    unitOfSale: "bottle",
    price: "184.00",
    purchaseCost: "112.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 41,
    reorderLevel: 10,
    tracksBatches: true,
    leadTime: [2, 3],
    storageCondition: "AMBIENT",
    handlingNotes: "Flammable. Keep tightly closed, away from heat and direct sunlight.",
    hazardClass: "Flammable liquid, Class 3",
    sourcingMode: "IMPORT",
    specifications: [
      ["Form", "Concentrated solution in methanol"],
      ["Dilution", "1:20 with buffered water, pH 7.2"],
      ["Shelf life", "36 months unopened"],
    ],
    searchTerms: "giemsa malaria blood film stain romanowsky",
  } as ProductSeed & { hazardClass?: string },
  {
    slug: "microscope-slides-frosted-end-box-50",
    name: "Microscope slides, frosted end",
    summary: "76 × 26 mm ground-edge slides with a frosted writing end.",
    description:
      "Pre-cleaned soda-lime glass microscope slides, 76 × 26 mm, 1.0–1.2 mm thick, with ground edges and a frosted end for pencil marking. Supplied in boxes of 50.",
    category: "slides-and-coverslips",
    manufacturer: "sunrise-medical-supplies",
    catalogueNumber: "SR-SLD-7626F",
    sku: "NMD-CON-0101",
    packSize: "Box of 50",
    unitOfSale: "box",
    unitsPerPack: 50,
    price: "34.00",
    comparePrice: "42.00",
    purchaseCost: "19.50",
    purchaseMode: "CHECKOUT",
    stockOnHand: 220,
    reorderLevel: 40,
    leadTime: [1, 3],
    sourcingMode: "IMPORT",
    specifications: [
      ["Dimensions", "76 × 26 mm"],
      ["Thickness", "1.0–1.2 mm"],
      ["Edges", "Ground, 90°"],
      ["Finish", "Frosted one end, one side"],
    ],
    image: "microscope-slides",
    imageAlt: "An open box of glass microscope slides with a row of slides fanned out in front",
    isFeatured: true,
    searchTerms: "slides glass frosted microscope 7626",
  },
  {
    slug: "pipette-tips-200ul-racked-96",
    name: "Pipette tips, 200 µL, racked",
    summary: "Universal-fit clear polypropylene tips in a reloadable rack.",
    description:
      "Graduated 200 µL pipette tips moulded from virgin polypropylene, free of DNase, RNase and pyrogens. Supplied racked, 96 per rack, in a reusable hinged box.",
    category: "pipette-tips",
    manufacturer: "sunrise-medical-supplies",
    catalogueNumber: "SR-TIP-200R",
    sku: "NMD-CON-0120",
    packSize: "Rack of 96",
    unitOfSale: "rack",
    unitsPerPack: 96,
    price: "58.00",
    purchaseCost: "33.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 96,
    reorderLevel: 24,
    leadTime: [1, 3],
    sourcingMode: "IMPORT",
    specifications: [
      ["Volume", "0.5–200 µL"],
      ["Material", "Virgin polypropylene"],
      ["Purity", "DNase, RNase and pyrogen free"],
      ["Autoclavable", "Yes, 121 °C for 20 minutes"],
    ],
    compatibleWith: ["Most universal-fit micropipettes"],
    image: "pipette-tips",
    imageAlt: "A clear rack of blue pipette tips with the lid open and three loose tips in front",
    searchTerms: "tips pipette 200ul yellow racked",
  },
  {
    slug: "nitrile-examination-gloves-powder-free-box-100",
    name: "Nitrile examination gloves, powder-free",
    summary: "Single-use, non-sterile nitrile gloves. Available in S, M and L.",
    description:
      "Powder-free blue nitrile examination gloves with textured fingertips, ambidextrous, non-sterile. Latex-free, suitable for staff and patients with latex sensitivity.",
    category: "personal-protective-equipment",
    manufacturer: "sunrise-medical-supplies",
    catalogueNumber: "SR-GLV-NTR-M",
    sku: "NMD-PPE-0201",
    packSize: "Box of 100",
    unitOfSale: "box",
    unitsPerPack: 100,
    price: "96.00",
    purchaseCost: "58.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 310,
    reorderLevel: 60,
    leadTime: [1, 2],
    sourcingMode: "BOTH",
    specifications: [
      ["Material", "Nitrile butadiene rubber"],
      ["Powder", "Powder-free"],
      ["Sizes", "Small, Medium, Large"],
      ["Thickness", "0.10 mm palm"],
      ["Standard", "EN 455, AQL 1.5"],
    ],
    image: "nitrile-gloves",
    imageAlt: "A blue and white dispenser box of nitrile gloves with two gloves pulled out",
    isFeatured: true,
    searchTerms: "gloves nitrile exam powder free latex free",
  },
  {
    slug: "mueller-hinton-agar-500g",
    name: "Mueller-Hinton agar",
    summary: "Dehydrated medium for antimicrobial susceptibility testing.",
    description:
      "Dehydrated culture medium for disc diffusion susceptibility testing by the Kirby-Bauer method, conforming to CLSI requirements for cation content and thymidine.",
    category: "culture-media",
    manufacturer: "hexachem",
    catalogueNumber: "HX-MHA-500",
    sku: "NMD-MIC-0301",
    packSize: "500 g",
    unitOfSale: "bottle",
    price: "342.00",
    purchaseCost: "214.00",
    purchaseMode: "BOTH",
    stockOnHand: 12,
    reorderLevel: 4,
    tracksBatches: true,
    leadTime: [3, 7],
    storageCondition: "AMBIENT",
    handlingNotes: "Store dry, 15–25 °C, tightly closed. Discard if caked or discoloured.",
    sourcingMode: "IMPORT",
    specifications: [
      ["Preparation", "38 g per litre"],
      ["pH", "7.3 ± 0.1 at 25 °C"],
      ["Yield", "Approximately 13 litres per 500 g"],
    ],
    image: "culture-medium",
    imageAlt:
      "An open white laboratory jar beside a dish of cream-coloured culture medium powder and stacked Petri dishes",
    searchTerms: "mueller hinton agar susceptibility kirby bauer media",
  },
  {
    slug: "blood-agar-base-500g",
    name: "Blood agar base",
    summary: "General purpose base for blood-enriched plates.",
    description:
      "Dehydrated blood agar base for the preparation of blood and chocolate agar plates, supporting the growth of fastidious organisms when enriched with sterile defibrinated blood.",
    category: "culture-media",
    manufacturer: "hexachem",
    catalogueNumber: "HX-BAB-500",
    sku: "NMD-MIC-0302",
    packSize: "500 g",
    unitOfSale: "bottle",
    price: "268.00",
    purchaseCost: "167.00",
    purchaseMode: "BOTH",
    stockOnHand: 9,
    reorderLevel: 4,
    tracksBatches: true,
    leadTime: [3, 7],
    sourcingMode: "IMPORT",
    specifications: [
      ["Preparation", "40 g per litre"],
      ["pH", "7.3 ± 0.2 at 25 °C"],
    ],
    searchTerms: "blood agar base chocolate plate media",
  },
  {
    slug: "sterile-cotton-swabs-pack-100",
    name: "Sterile cotton swabs, plain",
    summary: "Individually wrapped wood-shaft swabs for specimen collection.",
    description:
      "Sterile absorbent cotton-tipped applicators on a wooden shaft, individually wrapped in paper-peel packs.",
    category: "swabs-and-loops",
    manufacturer: "sunrise-medical-supplies",
    catalogueNumber: "SR-SWB-150W",
    sku: "NMD-MIC-0310",
    packSize: "Pack of 100",
    unitOfSale: "pack",
    unitsPerPack: 100,
    price: "42.00",
    purchaseCost: "23.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 150,
    reorderLevel: 30,
    leadTime: [1, 3],
    sourcingMode: "IMPORT",
    specifications: [
      ["Shaft", "Wood, 150 mm"],
      ["Tip", "Absorbent cotton"],
      ["Sterility", "Gamma irradiated, individually wrapped"],
    ],
    searchTerms: "swabs cotton sterile applicator specimen",
  },
  {
    slug: "edta-k3-vacuum-tubes-4ml-box-100",
    name: "EDTA K3 vacuum blood collection tubes, 4 mL",
    summary: "Lavender-top tubes for full blood counts and haematology.",
    description:
      "Evacuated blood collection tubes containing spray-dried tripotassium EDTA, for whole blood haematology. Lavender closure, 13 × 75 mm, 4 mL draw.",
    category: "blood-collection",
    manufacturer: "vitalon",
    catalogueNumber: "VT-EDTA-4K3",
    sku: "NMD-BCL-0401",
    packSize: "Box of 100",
    unitOfSale: "box",
    unitsPerPack: 100,
    price: "148.00",
    purchaseCost: "89.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 64,
    reorderLevel: 20,
    tracksBatches: true,
    leadTime: [2, 4],
    sourcingMode: "IMPORT",
    specifications: [
      ["Additive", "K3 EDTA, spray dried"],
      ["Draw volume", "4 mL"],
      ["Dimensions", "13 × 75 mm"],
      ["Closure", "Lavender"],
    ],
    compatibleWith: ["Standard haematology analysers", "Manual differential counts"],
    image: "edta-tubes",
    imageAlt: "A bundle of clear blood collection tubes with purple rubber caps",
    isFeatured: true,
    searchTerms: "edta tube lavender purple fbc full blood count haematology vacutainer",
  },
  {
    slug: "blood-collection-needles-21g-box-100",
    name: "Vacuum blood collection needles, 21G",
    summary: "Multi-sample needles for use with a standard holder.",
    description:
      "Sterile single-use multi-sample blood collection needles, 21 gauge × 1 inch, with a colour-coded hub and a rubber sleeve that seals between tubes.",
    category: "blood-collection",
    manufacturer: "vitalon",
    catalogueNumber: "VT-NDL-21G1",
    sku: "NMD-BCL-0410",
    packSize: "Box of 100",
    unitOfSale: "box",
    unitsPerPack: 100,
    price: "112.00",
    purchaseCost: "66.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 78,
    reorderLevel: 20,
    leadTime: [2, 4],
    sourcingMode: "IMPORT",
    specifications: [
      ["Gauge", "21G"],
      ["Length", "1 inch (25 mm)"],
      ["Sterility", "Ethylene oxide, single use"],
    ],
    searchTerms: "needle 21g multisample blood collection phlebotomy",
  },
  {
    slug: "tourniquet-latex-free",
    name: "Tourniquet, latex-free",
    summary: "Buckle-release venepuncture tourniquet.",
    description:
      "A reusable latex-free tourniquet with a quick-release buckle, for venepuncture and cannulation. Wipeable between patients.",
    category: "blood-collection",
    manufacturer: "vitalon",
    catalogueNumber: "VT-TRQ-BK",
    sku: "NMD-BCL-0420",
    packSize: "Single",
    unitOfSale: "piece",
    price: "26.00",
    purchaseCost: "13.50",
    purchaseMode: "CHECKOUT",
    stockOnHand: 140,
    reorderLevel: 30,
    leadTime: [1, 3],
    sourcingMode: "BOTH",
    searchTerms: "tourniquet venepuncture latex free buckle",
  },
  {
    slug: "haematology-control-3-part-normal",
    name: "Haematology control, 3-part differential, normal level",
    summary: "Assayed whole-blood control for three-part analysers.",
    description:
      "An assayed tri-level-compatible haematology control at the normal level, for daily quality control of three-part differential analysers. Supplied with an assay sheet giving ranges for the common platforms.",
    category: "controls-and-calibrators",
    manufacturer: "meridian-diagnostics",
    catalogueNumber: "MD-HCT-3N",
    sku: "NMD-HCH-0501",
    packSize: "3 × 3 mL",
    unitOfSale: "kit",
    price: "615.00",
    purchaseCost: "412.00",
    purchaseMode: "QUOTATION",
    stockOnHand: 6,
    reorderLevel: 3,
    tracksBatches: true,
    leadTime: [5, 10],
    storageCondition: "REFRIGERATED",
    handlingNotes:
      "Store at 2–8 °C. Do not freeze. Bring to room temperature and mix gently before use. Open-vial stability 14 days.",
    requiresColdChain: true,
    sourcingMode: "IMPORT",
    specifications: [
      ["Level", "Normal"],
      ["Parameters", "WBC, RBC, HGB, HCT, MCV, MCH, MCHC, PLT"],
      ["Closed-vial stability", "To the expiry date at 2–8 °C"],
      ["Open-vial stability", "14 days at 2–8 °C"],
    ],
    compatibleWith: ["Three-part differential haematology analysers"],
    searchTerms: "control haematology hematology quality control qc 3 part",
  },
  {
    slug: "malaria-pf-pan-rapid-test-25",
    name: "Malaria Pf/Pan rapid test cassette",
    summary: "Whole-blood immunochromatographic test distinguishing P. falciparum.",
    description:
      "A rapid immunochromatographic cassette test for the qualitative detection of Plasmodium falciparum-specific HRP-II and pan-Plasmodium LDH antigens in whole blood. Each kit contains cassettes, buffer, capillary tubes and lancets.",
    category: "infectious-disease-tests",
    manufacturer: "meridian-diagnostics",
    catalogueNumber: "MD-MAL-PFPAN25",
    sku: "NMD-DGX-0601",
    packSize: "25 tests",
    unitOfSale: "kit",
    unitsPerPack: 25,
    price: "238.00",
    purchaseCost: "151.00",
    purchaseMode: "BOTH",
    stockOnHand: 47,
    reorderLevel: 12,
    tracksBatches: true,
    leadTime: [2, 5],
    storageCondition: "AMBIENT",
    handlingNotes:
      "Store 4–30 °C in the sealed pouch. Do not freeze. Use within 30 minutes of opening a pouch.",
    sourcingMode: "IMPORT",
    specifications: [
      ["Sample", "Whole blood, 5 µL"],
      ["Reading time", "15–20 minutes"],
      ["Targets", "P. falciparum HRP-II, pan-Plasmodium LDH"],
      ["Kit contents", "25 cassettes, buffer, capillary tubes, lancets, alcohol swabs"],
    ],
    image: "rapid-test",
    imageAlt:
      "Several white rapid test cassettes with clear result windows beside a dropper bottle and a sealed foil pouch",
    isFeatured: true,
    isNewArrival: true,
    searchTerms: "malaria rdt rapid test pf pan falciparum hrp2",
  },
  {
    slug: "hiv-1-2-rapid-test-30",
    name: "HIV 1/2 rapid test",
    summary: "Third-generation rapid antibody test for HIV-1 and HIV-2.",
    description:
      "A qualitative immunochromatographic assay for the detection of antibodies to HIV-1 and HIV-2 in serum, plasma or whole blood. Supplied to laboratories and health facilities only.",
    category: "infectious-disease-tests",
    manufacturer: "meridian-diagnostics",
    catalogueNumber: "MD-HIV-12-30",
    sku: "NMD-DGX-0610",
    packSize: "30 tests",
    unitOfSale: "kit",
    unitsPerPack: 30,
    price: "284.00",
    purchaseCost: "182.00",
    purchaseMode: "QUOTATION",
    stockOnHand: 22,
    reorderLevel: 8,
    tracksBatches: true,
    leadTime: [3, 7],
    storageCondition: "AMBIENT",
    requiresColdChain: false,
    restrictedSale: true,
    restrictionNote:
      "Supplied to registered laboratories, hospitals and health facilities. We will ask for your facility details before confirming an order.",
    sourcingMode: "IMPORT",
    specifications: [
      ["Sample", "Serum, plasma or whole blood"],
      ["Reading time", "15 minutes"],
      ["Targets", "Anti-HIV-1 and anti-HIV-2 antibodies"],
    ],
    searchTerms: "hiv rapid test antibody screening",
  },
  {
    slug: "disposable-syringes-5ml-box-100",
    name: "Disposable syringes, 5 mL with needle",
    summary: "Sterile single-use three-part syringes with a 21G needle.",
    description:
      "Three-part disposable syringes with a latex-free plunger seal and clear graduations, supplied with a 21G × 1½ inch needle, individually blister-packed and sterile.",
    category: "medical-consumables",
    manufacturer: "sunrise-medical-supplies",
    catalogueNumber: "SR-SYR-5ML21",
    sku: "NMD-MCN-0701",
    packSize: "Box of 100",
    unitOfSale: "box",
    unitsPerPack: 100,
    price: "88.00",
    purchaseCost: "49.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 186,
    reorderLevel: 40,
    leadTime: [1, 3],
    sourcingMode: "BOTH",
    specifications: [
      ["Volume", "5 mL"],
      ["Needle", "21G × 1½ inch"],
      ["Type", "Three-part, latex-free"],
      ["Sterility", "Ethylene oxide, single use"],
    ],
    image: "syringes",
    imageAlt: "A loose pile of clear disposable syringes with orange needle caps",
    searchTerms: "syringe 5ml needle disposable injection",
  },
  {
    slug: "sterile-gauze-swabs-10x10-pack-100",
    name: "Sterile gauze swabs, 10 × 10 cm",
    summary: "Eight-ply cotton gauze in sterile peel packs of five.",
    description:
      "Absorbent cotton gauze swabs, 10 × 10 cm, eight ply, with folded edges to reduce loose fibres. Supplied sterile in peel packs of five, one hundred swabs per pack.",
    category: "medical-consumables",
    manufacturer: "accralab",
    catalogueNumber: "AL-GAZ-1010-8",
    sku: "NMD-MCN-0710",
    packSize: "Pack of 100",
    unitOfSale: "pack",
    unitsPerPack: 100,
    price: "64.00",
    purchaseCost: "36.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 240,
    reorderLevel: 50,
    leadTime: [1, 2],
    sourcingMode: "LOCAL",
    specifications: [
      ["Size", "10 × 10 cm"],
      ["Ply", "8"],
      ["Packing", "5 per sterile peel pack"],
    ],
    image: "gauze-swabs",
    imageAlt: "A neat stack of folded white gauze swabs beside two sterile peel packs",
    searchTerms: "gauze swabs sterile dressing cotton",
  },
  {
    slug: "binocular-laboratory-microscope",
    name: "Binocular laboratory microscope",
    summary: "Achromatic 4×–100× biological microscope with LED illumination.",
    description:
      "A binocular compound microscope for routine clinical and teaching work. Quadruple nosepiece with 4×, 10×, 40× and 100× oil achromatic objectives, widefield 10× eyepieces, mechanical stage, Abbe condenser with iris, and dimmable LED illumination. Supplied with a dust cover, spare bulb and immersion oil. Installation and a half-day of operator training are available.",
    category: "microscopes",
    manufacturer: "vitalon",
    catalogueNumber: "VT-MIC-B400",
    sku: "NMD-EQP-0801",
    packSize: "Single unit",
    unitOfSale: "unit",
    price: "8450.00",
    purchaseCost: "5720.00",
    purchaseMode: "QUOTATION",
    stockOnHand: 3,
    reorderLevel: 1,
    allowBackorder: true,
    leadTime: [7, 21],
    sourcingMode: "IMPORT",
    specifications: [
      ["Head", "Binocular, 30° inclined, 360° rotatable"],
      ["Objectives", "4×, 10×, 40×, 100× oil achromatic"],
      ["Eyepieces", "Widefield 10×/18 mm, pair"],
      ["Stage", "Double-layer mechanical, 140 × 140 mm"],
      ["Condenser", "Abbe NA 1.25 with iris diaphragm"],
      ["Illumination", "3 W LED, dimmable"],
      ["Power", "100–240 V AC, 50/60 Hz"],
      ["Warranty", "24 months on parts"],
    ],
    image: "microscope",
    imageAlt: "A binocular laboratory microscope in white and dark grey, seen from three quarters",
    isFeatured: true,
    searchTerms: "microscope binocular compound 1000x laboratory teaching",
  },
  {
    slug: "benchtop-centrifuge-12-place",
    name: "Benchtop centrifuge, 12 × 15 mL",
    summary: "Variable-speed clinical centrifuge with a timer and lid interlock.",
    description:
      "A compact benchtop centrifuge for serum separation and routine clinical work. Twelve-place angle rotor for 15 mL tubes, variable speed to 4,000 rpm, 0–60 minute timer, lid interlock and imbalance cut-out.",
    category: "centrifuges",
    manufacturer: "vitalon",
    catalogueNumber: "VT-CEN-12A",
    sku: "NMD-EQP-0810",
    packSize: "Single unit",
    unitOfSale: "unit",
    price: "4980.00",
    purchaseCost: "3310.00",
    purchaseMode: "QUOTATION",
    stockOnHand: 2,
    reorderLevel: 1,
    allowBackorder: true,
    leadTime: [7, 21],
    sourcingMode: "IMPORT",
    specifications: [
      ["Capacity", "12 × 15 mL angle rotor"],
      ["Maximum speed", "4,000 rpm"],
      ["Maximum RCF", "2,380 × g"],
      ["Timer", "0–60 minutes"],
      ["Safety", "Lid interlock, imbalance cut-out"],
      ["Power", "220–240 V AC, 50 Hz"],
    ],
    image: "centrifuge",
    imageAlt: "A white benchtop laboratory centrifuge with a closed lid and a small control panel",
    searchTerms: "centrifuge benchtop serum spin 4000rpm",
  },
  {
    slug: "semi-automated-chemistry-analyser",
    name: "Semi-automated clinical chemistry analyser",
    summary: "Open-system photometer with a flow cell and thermal printer.",
    description:
      "A semi-automated clinical chemistry analyser with a peristaltic flow-cell, eight interference filters, Peltier-controlled incubation at 25, 30 and 37 °C, and an open reagent system. Stores programmes for the common analytes and prints results on a built-in thermal printer. Supplied with installation, calibration and two days of operator training.",
    category: "analysers",
    manufacturer: "meridian-diagnostics",
    catalogueNumber: "MD-ANL-SA200",
    sku: "NMD-EQP-0820",
    packSize: "Single unit",
    unitOfSale: "unit",
    price: "32500.00",
    purchaseCost: "22800.00",
    purchaseMode: "QUOTATION",
    stockOnHand: 0,
    reorderLevel: 1,
    allowBackorder: true,
    leadTime: [21, 45],
    sourcingMode: "IMPORT",
    specifications: [
      ["Type", "Semi-automated, open system"],
      ["Optics", "8 interference filters, 340–670 nm"],
      ["Flow cell", "32 µL, Peltier controlled"],
      ["Temperature", "25 °C, 30 °C, 37 °C"],
      ["Throughput", "Up to 240 tests per hour"],
      ["Output", "Built-in thermal printer, USB"],
      ["Installation", "Included, Greater Accra and Ashanti"],
      ["Warranty", "12 months parts and labour"],
    ],
    compatibleWith: ["Open-channel liquid and lyophilised reagent systems"],
    image: "chemistry-analyser",
    imageAlt:
      "A white benchtop clinical chemistry analyser with a dark touchscreen and a tray of sample cups",
    isNewArrival: true,
    searchTerms: "chemistry analyser semi automated photometer biochemistry",
  },
  {
    slug: "digital-blood-pressure-monitor-upper-arm",
    name: "Digital blood pressure monitor, upper arm",
    summary: "Automatic oscillometric monitor with irregular-heartbeat detection.",
    description:
      "An automatic upper-arm blood pressure monitor for clinic and ward use. Oscillometric measurement with irregular heartbeat detection, two-user memory of sixty readings each, and a wide-range cuff for arms 22–42 cm. Runs on mains or batteries.",
    category: "hospital-equipment",
    manufacturer: "vitalon",
    catalogueNumber: "VT-BPM-U40",
    sku: "NMD-HSP-0901",
    packSize: "Single unit",
    unitOfSale: "unit",
    price: "548.00",
    comparePrice: "640.00",
    purchaseCost: "352.00",
    purchaseMode: "BOTH",
    stockOnHand: 26,
    reorderLevel: 8,
    leadTime: [2, 5],
    sourcingMode: "IMPORT",
    specifications: [
      ["Method", "Oscillometric"],
      ["Pressure range", "0–299 mmHg"],
      ["Pulse range", "40–180 beats per minute"],
      ["Cuff", "22–42 cm"],
      ["Memory", "2 users × 60 readings"],
      ["Power", "Mains adapter or 4 × AA"],
    ],
    image: "bp-monitor",
    imageAlt:
      "A white digital blood pressure monitor with a blank screen beside its coiled grey arm cuff",
    isFeatured: true,
    searchTerms: "blood pressure monitor bp machine sphygmomanometer digital",
  },
  {
    slug: "fingertip-pulse-oximeter",
    name: "Fingertip pulse oximeter",
    summary: "SpO₂ and pulse rate on an OLED display, with a lanyard.",
    description:
      "A compact fingertip pulse oximeter measuring oxygen saturation and pulse rate, with a rotating OLED display, automatic power-off and a low-battery indicator. Supplied with a lanyard and two AAA batteries.",
    category: "hospital-equipment",
    manufacturer: "sunrise-medical-supplies",
    catalogueNumber: "SR-OXI-F10",
    sku: "NMD-HSP-0910",
    packSize: "Single unit",
    unitOfSale: "unit",
    price: "178.00",
    purchaseCost: "98.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 54,
    reorderLevel: 15,
    leadTime: [1, 4],
    sourcingMode: "IMPORT",
    specifications: [
      ["SpO₂ range", "70–100%, ±2%"],
      ["Pulse range", "30–250 bpm, ±2 bpm"],
      ["Display", "Rotating OLED"],
      ["Power", "2 × AAA, approximately 30 hours"],
    ],
    image: "pulse-oximeter",
    imageAlt: "A white fingertip pulse oximeter with a blank display and a coiled grey lanyard",
    searchTerms: "pulse oximeter spo2 oxygen saturation fingertip",
  },
  {
    slug: "dissecting-instrument-set-stainless",
    name: "Dissecting instrument set, stainless steel",
    summary: "Five-piece set: forceps, scissors, scalpel handle, probe and seeker.",
    description:
      "A five-piece dissecting set in surgical-grade stainless steel, comprising toothed dissecting forceps, straight sharp/blunt scissors, a number 4 scalpel handle, a probe and a seeker. Supplied in a hinged case. Autoclavable.",
    category: "surgical-instruments",
    manufacturer: "accralab",
    catalogueNumber: "AL-DIS-5PC",
    sku: "NMD-SRG-1001",
    packSize: "Set of 5",
    unitOfSale: "set",
    unitsPerPack: 5,
    price: "386.00",
    purchaseCost: "238.00",
    purchaseMode: "BOTH",
    stockOnHand: 17,
    reorderLevel: 5,
    leadTime: [2, 6],
    sourcingMode: "BOTH",
    specifications: [
      ["Material", "AISI 410 surgical stainless steel"],
      ["Contents", "Forceps, scissors, scalpel handle, probe, seeker"],
      ["Sterilisation", "Autoclavable, 134 °C"],
    ],
    image: "surgical-instruments",
    imageAlt:
      "Five polished stainless steel surgical instruments laid out in a row: forceps, scissors, a scalpel handle and a probe",
    searchTerms: "dissecting set forceps scissors scalpel instruments stainless",
  },
  {
    slug: "surgical-face-masks-3ply-box-50",
    name: "Surgical face masks, 3-ply",
    summary: "Type II fluid-resistant masks with an adjustable nose wire.",
    description:
      "Three-ply pleated surgical face masks with an adjustable aluminium nose wire and soft ear loops. Bacterial filtration efficiency of 98%, fluid resistant.",
    category: "personal-protective-equipment",
    manufacturer: "sunrise-medical-supplies",
    catalogueNumber: "SR-MSK-3PL50",
    sku: "NMD-PPE-0210",
    packSize: "Box of 50",
    unitOfSale: "box",
    unitsPerPack: 50,
    price: "38.00",
    purchaseCost: "19.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 420,
    reorderLevel: 80,
    leadTime: [1, 2],
    sourcingMode: "BOTH",
    specifications: [
      ["Layers", "3-ply, melt-blown middle layer"],
      ["Filtration", "BFE ≥ 98%"],
      ["Standard", "EN 14683 Type IIR"],
      ["Fitting", "Ear loops, adjustable nose wire"],
    ],
    image: "face-masks",
    imageAlt: "A white dispenser box of light blue surgical face masks with two masks in front",
    searchTerms: "face mask surgical 3ply disposable",
  },
  {
    slug: "test-tube-rack-polypropylene-50-place",
    name: "Test tube rack, polypropylene, 50 place",
    summary: "Autoclavable three-tier rack for 16 mm tubes.",
    description:
      "A moulded polypropylene test tube rack with fifty 17 mm wells across three tiers, with drainage holes and moulded end grips. Autoclavable and resistant to common laboratory solvents.",
    category: "laboratory-furniture",
    manufacturer: "accralab",
    catalogueNumber: "AL-RCK-50P",
    sku: "NMD-FUR-1101",
    packSize: "Single",
    unitOfSale: "piece",
    price: "72.00",
    purchaseCost: "41.00",
    purchaseMode: "CHECKOUT",
    stockOnHand: 38,
    reorderLevel: 10,
    leadTime: [1, 4],
    sourcingMode: "LOCAL",
    specifications: [
      ["Wells", "50, 17 mm diameter"],
      ["Material", "Polypropylene"],
      ["Autoclavable", "Yes, 121 °C"],
    ],
    searchTerms: "test tube rack 50 place polypropylene stand",
  },
];

// ---------------------------------------------------------------------------
// Payment plans
// ---------------------------------------------------------------------------

/**
 * The illustrative ladder from the brief, seeded as data rather than as
 * constants — which is the point. An administrator adds, re-rates, disables or
 * removes any of these without a deploy, and the figures below are a starting
 * position, not a business decision this code is making.
 *
 * All four start disabled except outright. Instalment terms are a
 * consumer-credit offering under Ghanaian law and are not switched on until
 * that has been checked; see docs/medical/REGULATORY.md.
 */
const PAYMENT_PLANS = [
  {
    slug: "outright",
    name: "Outright payment",
    description: "Paid in full before dispatch.",
    months: 0,
    instalmentCount: 0,
    upliftRate: "0.0000",
    depositRate: "1.0000",
    institutionsOnly: false,
    requiresCreditApproval: false,
    isActive: true,
    position: 0,
    termsText: "Payment in full before dispatch.",
  },
  {
    slug: "three-months",
    name: "3 months",
    description: "A deposit, then two monthly payments.",
    months: 3,
    instalmentCount: 2,
    upliftRate: "0.0500",
    depositRate: "0.4000",
    isActive: false,
    position: 1,
    termsText: "40% deposit on acceptance, balance over 2 monthly instalments.",
  },
  {
    slug: "six-months",
    name: "6 months",
    description: "A deposit, then five monthly payments.",
    months: 6,
    instalmentCount: 5,
    upliftRate: "0.1000",
    depositRate: "0.3000",
    isActive: false,
    position: 2,
    termsText: "30% deposit on acceptance, balance over 5 monthly instalments.",
  },
  {
    slug: "twelve-months",
    name: "12 months",
    description: "A deposit, then eleven monthly payments.",
    months: 12,
    instalmentCount: 11,
    upliftRate: "0.1800",
    depositRate: "0.2500",
    minimumOrderValue: "5000.00",
    isActive: false,
    position: 3,
    termsText: "25% deposit on acceptance, balance over 11 monthly instalments.",
  },
];

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

const HOMEPAGE_BLOCKS = [
  {
    kind: "HERO",
    position: 0,
    title: "Laboratory and medical supplies, sourced properly.",
    subtitle: "",
    body: "Reagents, diagnostics, consumables and equipment for hospitals, laboratories and clinics across Ghana. Buy what we hold in stock, or send us a list and we will price it.",
    image: "/medical/hero.webp",
    imageAlt:
      "Reagent bottles, a micropipette, a rack of capped test tubes, examination gloves and a benchtop analyser arranged on a pale surface",
    ctaLabel: "Browse the catalogue",
    ctaHref: "/medicals/categories",
    secondaryCtaLabel: "Request a quotation",
    secondaryCtaHref: "/medicals/quotations/new",
    source: "",
    config: "{}",
  },
  {
    kind: "PROMO",
    position: 60,
    title: "Send us a list. We will price it.",
    body: "Several items at once, including things that are not on this site. Tell us the quantities and we will come back with prices, lead times and terms — usually the same day.",
    ctaLabel: "Request a quotation",
    ctaHref: "/medicals/quotations/new",
    image: "",
    imageAlt: "",
    subtitle: "",
    secondaryCtaLabel: "",
    secondaryCtaHref: "",
    source: "",
    config: "{}",
  },
];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTINGS = [
  { key: "business.name", value: "Nickimart Medical", group: "general", label: "Business name" },
  { key: "business.email", value: "medical@nickimart.com", group: "general", label: "Business email" },
  { key: "business.phone", value: "+233 20 000 0000", group: "general", label: "Business phone" },
  { key: "business.address", value: "Accra, Ghana", group: "general", label: "Business address" },
  { key: "business.currency", value: "GHS", group: "general", label: "Currency" },
  {
    key: "quotation.validityDays",
    value: "30",
    valueType: "number",
    group: "quotations",
    label: "Default quotation validity (days)",
    helpText: "How long a new quotation is valid for unless the person issuing it says otherwise.",
  },
  {
    key: "quotation.defaultPaymentTerms",
    value: "Payment in full before dispatch, unless otherwise agreed in writing.",
    group: "quotations",
    label: "Default payment terms",
  },
  {
    key: "tax.enabled",
    value: "false",
    valueType: "boolean",
    group: "finance",
    label: "Show a tax line on documents",
    helpText:
      "Off until the business states its VAT, NHIL and GETFund position. No rate is assumed anywhere in the code.",
  },
  {
    key: "tax.rate",
    value: "0",
    valueType: "number",
    group: "finance",
    label: "Tax rate (percent)",
  },
  {
    key: "stock.lowStockThreshold",
    value: "5",
    valueType: "number",
    group: "inventory",
    label: "Low stock threshold",
    helpText: "At or below this, the storefront says 'Low stock' rather than 'In stock'.",
  },
  {
    key: "redistributor.defaultCommissionRate",
    value: "0.0500",
    group: "redistributors",
    label: "Default commission rate",
    helpText: "Used when neither the redistributor nor the category sets one.",
  },
  {
    key: "instalments.enabled",
    value: "false",
    valueType: "boolean",
    group: "finance",
    label: "Offer instalment plans to customers",
    helpText:
      "Off until the Ghanaian consumer-credit position has been checked. See docs/medical/REGULATORY.md.",
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.MEDICAL_DATABASE_URL?.trim()) {
    console.error(
      "MEDICAL_DATABASE_URL is not set. The medical seed will not run against the retail\n" +
        "database by accident — set the variable to a medical database and try again.",
    );
    process.exit(1);
  }

  console.log("Seeding Nickimart Medical…\n");

  // --- Categories ----------------------------------------------------------
  const categoryIds = new Map<string, string>();
  let position = 0;
  for (const seed of CATEGORIES) {
    const parent = await db.medicalCategory.upsert({
      where: { slug: seed.slug },
      update: {
        name: seed.name,
        description: seed.description,
        icon: seed.icon,
        position,
        isActive: true,
      },
      create: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        icon: seed.icon,
        position,
        showInSidebar: true,
      },
    });
    categoryIds.set(seed.slug, parent.id);
    position += 10;

    let childPosition = 0;
    for (const child of seed.children ?? []) {
      const row = await db.medicalCategory.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id, position: childPosition },
        create: {
          slug: child.slug,
          name: child.name,
          parentId: parent.id,
          position: childPosition,
          icon: seed.icon,
          // Children are reachable from their parent and from the mega menu;
          // putting all thirty in the sidebar would make it a wall.
          showInSidebar: false,
        },
      });
      categoryIds.set(child.slug, row.id);
      childPosition += 10;
    }
  }
  console.log(`  categories      ${categoryIds.size}`);

  // --- Manufacturers -------------------------------------------------------
  const manufacturerIds = new Map<string, string>();
  for (const [index, seed] of MANUFACTURERS.entries()) {
    const row = await db.manufacturer.upsert({
      where: { slug: seed.slug },
      update: { name: seed.name, country: seed.country, position: index },
      create: { ...seed, position: index },
    });
    manufacturerIds.set(seed.slug, row.id);
  }
  console.log(`  manufacturers   ${manufacturerIds.size}`);

  // --- Products ------------------------------------------------------------
  let productCount = 0;
  for (const [index, seed] of PRODUCTS.entries()) {
    const categoryId = categoryIds.get(seed.category);
    if (!categoryId) {
      console.warn(`  ! ${seed.slug} names an unknown category "${seed.category}" — skipped`);
      continue;
    }

    const data = {
      name: seed.name,
      summary: seed.summary,
      description: seed.description,
      categoryId,
      manufacturerId: seed.manufacturer ? manufacturerIds.get(seed.manufacturer) : null,
      catalogueNumber: seed.catalogueNumber,
      packSize: seed.packSize,
      unitOfSale: seed.unitOfSale,
      unitsPerPack: seed.unitsPerPack ?? 0,
      price: seed.price,
      comparePrice: seed.comparePrice ?? null,
      purchaseCost: seed.purchaseCost,
      averageCost: seed.purchaseCost,
      purchaseMode: seed.purchaseMode,
      stockOnHand: seed.stockOnHand,
      reorderLevel: seed.reorderLevel ?? 0,
      reorderQuantity: (seed.reorderLevel ?? 0) * 2,
      allowBackorder: seed.allowBackorder ?? false,
      tracksBatches: seed.tracksBatches ?? false,
      leadTimeMinDays: seed.leadTime?.[0] ?? 2,
      leadTimeMaxDays: seed.leadTime?.[1] ?? 7,
      storageCondition: seed.storageCondition ?? "AMBIENT",
      handlingNotes: seed.handlingNotes ?? "",
      requiresColdChain: seed.requiresColdChain ?? false,
      hazardClass: (seed as { hazardClass?: string }).hazardClass ?? "",
      restrictedSale: seed.restrictedSale ?? false,
      restrictionNote: seed.restrictionNote ?? "",
      sourcingMode: seed.sourcingMode ?? "LOCAL",
      specifications: JSON.stringify(
        (seed.specifications ?? []).map(([label, value]) => ({ label, value })),
      ),
      compatibleWith: JSON.stringify(seed.compatibleWith ?? []),
      documents: "[]",
      searchTerms: seed.searchTerms ?? "",
      // Nothing is out of stock by status: availability is derived from the
      // figures, so a line that sells out is still ACTIVE and still quotable.
      status: "ACTIVE",
      isFeatured: seed.isFeatured ?? false,
      isNewArrival: seed.isNewArrival ?? false,
      position: index,
    };

    const product = await db.medicalProduct.upsert({
      where: { slug: seed.slug },
      update: data,
      create: { ...data, slug: seed.slug, sku: seed.sku },
    });
    productCount += 1;

    if (seed.image) {
      const url = `/medical/products/${seed.image}.webp`;
      const existing = await db.medicalProductImage.findFirst({
        where: { productId: product.id, url },
      });
      if (!existing) {
        await db.medicalProductImage.create({
          data: {
            productId: product.id,
            url,
            // Required rather than optional: a catalogue of unlabelled bottles
            // is unusable with a screen reader, and an alt text written at seed
            // time is one nobody has to go back and add.
            alt: seed.imageAlt ?? seed.name,
            position: 0,
          },
        });
      }
    }
  }
  console.log(`  products        ${productCount}`);

  // --- Payment plans -------------------------------------------------------
  for (const plan of PAYMENT_PLANS) {
    const { slug, minimumOrderValue, ...rest } = plan;
    await db.paymentPlan.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        ...rest,
        frequency: "MONTHLY",
        institutionsOnly: plan.institutionsOnly ?? true,
        requiresCreditApproval: plan.requiresCreditApproval ?? true,
        minimumOrderValue: minimumOrderValue ?? "0",
      },
    });
  }
  console.log(`  payment plans   ${PAYMENT_PLANS.length} (instalment plans created disabled)`);

  // --- Homepage ------------------------------------------------------------
  for (const block of HOMEPAGE_BLOCKS) {
    const existing = await db.homepageBlock.findFirst({
      where: { kind: block.kind, position: block.position },
    });
    if (existing) continue;
    await db.homepageBlock.create({ data: block });
  }
  console.log(`  homepage blocks ${HOMEPAGE_BLOCKS.length}`);

  // --- Document template ---------------------------------------------------
  await db.documentTemplate.upsert({
    where: { slug: "default-quotation" },
    update: {},
    create: {
      slug: "default-quotation",
      name: "Nickimart Medical — standard",
      documentType: "QUOTATION",
      design: JSON.stringify({
        accent: "#008277",
        ink: "#0d2537",
        logo: "",
        showLogo: true,
        columns: ["description", "catalogueNumber", "quantity", "unitPrice", "lineTotal"],
        footerNote: "Nickimart Medical · Accra, Ghana · medical@nickimart.com",
      }),
      defaultPaymentTerms: "Payment in full before dispatch, unless otherwise agreed in writing.",
      defaultNotes: "Prices are in Ghana cedis and are valid until the date shown above.",
      defaultTerms:
        "Goods remain the property of Nickimart Medical until paid for in full. Lead times are estimates from the date of order confirmation and are not guaranteed. Cold-chain items are dispatched only when the delivery address can receive them.",
      defaultValidityDays: 30,
      numberFormat: "QT-{YYYY}-{0000}",
      isDefault: true,
    },
  });

  await db.documentTemplate.upsert({
    where: { slug: "default-proforma" },
    update: {},
    create: {
      slug: "default-proforma",
      name: "Nickimart Medical — proforma",
      documentType: "PROFORMA",
      design: JSON.stringify({
        accent: "#008277",
        ink: "#0d2537",
        showLogo: true,
        columns: ["description", "catalogueNumber", "quantity", "unitPrice", "lineTotal"],
        footerNote:
          "This is a proforma invoice. It is not a receipt and not a tax invoice, and no payment has been received against it.",
      }),
      defaultPaymentTerms: "Payment in full before dispatch, unless otherwise agreed in writing.",
      defaultNotes:
        "This proforma invoice states the agreed goods, quantities, prices and terms. It is issued to support internal approval and payment and is not evidence of payment.",
      defaultValidityDays: 30,
      numberFormat: "PI-{YYYY}-{0000}",
    },
  });
  console.log("  templates       2");

  // --- Expense categories --------------------------------------------------
  const EXPENSE_CATEGORIES = [
    "Freight and clearing",
    "Rent and utilities",
    "Salaries and wages",
    "Transport and delivery",
    "Marketing",
    "Bank and payment charges",
    "Office and administration",
  ];
  for (const [index, name] of EXPENSE_CATEGORIES.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await db.expenseCategory.upsert({
      where: { slug },
      update: {},
      create: { slug, name, position: index },
    });
  }
  console.log(`  expense groups  ${EXPENSE_CATEGORIES.length}`);

  // --- Settings ------------------------------------------------------------
  for (const setting of SETTINGS) {
    await db.medicalSetting.upsert({
      where: { key: setting.key },
      // Never overwritten: a setting somebody has changed is a decision, and a
      // re-run of the seed is not the place to undo it.
      update: {},
      create: {
        key: setting.key,
        value: setting.value,
        valueType: setting.valueType ?? "string",
        group: setting.group,
        label: setting.label,
        helpText: setting.helpText ?? "",
      },
    });
  }
  console.log(`  settings        ${SETTINGS.length}`);

  console.log("\nDone. No orders, customers or sales history were created — those are");
  console.log("real events, and a dashboard that opens on invented ones is a dashboard");
  console.log("nobody can trust afterwards.");
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
