// The executive branch, in plain English, for /government and the landing's
// "Who Runs The Government" section. Checked against official pages on
// GOV_AS_OF (whitehouse.gov cabinet page, each department's leadership page,
// USA.gov, OPM workforce data). This file is the source of truth and is edited
// directly; a scheduled agent re-checks it every month following
// docs/government-recheck.md. People change jobs: re-check every name before
// changing the date.
//
// Employee counts are our own sums of OPM's public employment file by
// department (civilians only), and are labelled that way on the page.

export const GOV_AS_OF = "2026-11-16"

// The film: a scale model made with Higgsfield (image and video generation),
// not a photograph of a real place. The page says so under it.
export const GOV_FILM = {
  src: '/gov/hierarchy.mp4',
  poster: '/gov/hierarchy.jpg',
  alt: 'A white scale model in three tiers: the White House on top, fifteen department buildings in a row under it, and a field of small office blocks at the bottom.',
  note: 'The model is an illustration made with AI. The buildings further down this page are real photographs.',
}

// `at` is the second of the film at which the camera reaches that tier.
export const GOV_LADDER = [
  { id: 'president', at: 0, title: 'At the top: the President', body: 'One elected person leads the executive branch. The President signs or vetoes the bills Congress passes and commands the military.' },
  { id: 'departments', at: 2.4, title: 'In the middle: 15 departments', body: 'Each one covers a part of national life, such as defense, health or transportation. The President picks each leader, and the Senate must confirm them.' },
  { id: 'workers', at: 5, title: 'At the bottom: about 2.0 million workers', body: 'Nearly all are career staff who stay when the President changes. They process benefits, inspect food, forecast the weather and guard the borders.', source: "https://data.opm.gov/explore-data/analytics/workforce-size-and-composition", sourceLabel: 'OPM, September 2026' },
]

export const DEPARTMENTS = [
  {
    "id": "state",
    "name": "Department of State",
    "short": "State",
    "founded": "1789, the first executive department",
    "headTitle": "Secretary of State",
    "headName": "Marco Rubio",
    "acting": false,
    "headSource": "https://www.whitehouse.gov/administration/the-cabinet/",
    "does": "Handles the country’s relations with other nations and runs U.S. embassies around the world. It also issues passports to Americans and visas to foreign visitors.",
    "note": null,
    "agencies": [
      "Bureau of Consular Affairs (passports and visas)",
      "U.S. embassies and consulates",
      "Foreign Service",
      "Diplomatic Security Service"
    ],
    "employees": {
      "count": 11243,
      "note": "Civil Service staff only. Foreign Service officers and staff hired abroad are not counted."
    },
    "building": "Harry S Truman Building",
    "address": "2201 C Street NW, Washington, DC",
    "oversight": {
      "house": [
        "House Foreign Affairs"
      ],
      "senate": [
        "Senate Foreign Relations"
      ]
    },
    "website": "https://www.state.gov",
    "photo": "/gov/state.jpg"
  },
  {
    "id": "treasury",
    "name": "Department of the Treasury",
    "short": "Treasury",
    "founded": "1789",
    "headTitle": "Secretary of the Treasury",
    "headName": "Scott Bessent",
    "acting": false,
    "headSource": "https://home.treasury.gov/about/general-information/officials/scott-bessent",
    "does": "Manages the federal government’s money: it collects taxes, pays the government’s bills, and borrows by selling bonds. It also prints paper money and makes coins.",
    "note": null,
    "agencies": [
      "Internal Revenue Service (IRS)",
      "U.S. Mint",
      "Bureau of Engraving and Printing",
      "Bureau of the Fiscal Service",
      "Office of the Comptroller of the Currency",
      "Financial Crimes Enforcement Network (FinCEN)"
    ],
    "employees": {
      "count": 83063,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Treasury Building",
    "address": "1500 Pennsylvania Avenue NW, Washington, DC",
    "oversight": {
      "house": [
        "House Ways and Means",
        "House Financial Services"
      ],
      "senate": [
        "Senate Finance",
        "Senate Banking, Housing, and Urban Affairs"
      ]
    },
    "website": "https://home.treasury.gov",
    "photo": "/gov/treasury.jpg"
  },
  {
    "id": "defense",
    "name": "Department of Defense",
    "short": "Defense",
    "founded": "1947. It grew out of the War Department of 1789.",
    "headTitle": "Secretary of Defense",
    "headName": "Pete Hegseth",
    "acting": false,
    "headSource": "https://www.whitehouse.gov/administration/the-cabinet/",
    "does": "Runs the U.S. military, including the Army, Navy, Marine Corps, Air Force, and Space Force. It is the largest federal department by number of employees.",
    "note": "Also called the Department of War, a second title allowed by an executive order in 2025. Its name in law is still the Department of Defense.",
    "agencies": [
      "Department of the Army",
      "Department of the Navy (includes the Marine Corps)",
      "Department of the Air Force (includes the Space Force)",
      "National Security Agency",
      "Defense Intelligence Agency",
      "Army Corps of Engineers"
    ],
    "employees": {
      "count": 680072,
      "note": "Civilians only, as of August 2026. People in uniform are not counted."
    },
    "building": "The Pentagon",
    "address": "Arlington, Virginia",
    "oversight": {
      "house": [
        "House Armed Services"
      ],
      "senate": [
        "Senate Armed Services"
      ]
    },
    "website": "https://www.war.gov",
    "photo": "/gov/defense.jpg"
  },
  {
    "id": "justice",
    "name": "Department of Justice",
    "short": "Justice",
    "founded": "1870. The office of Attorney General dates to 1789.",
    "headTitle": "Attorney General",
    "headName": "Todd Blanche",
    "acting": false,
    "headSource": "https://www.justice.gov/ag",
    "does": "Enforces federal law and represents the United States in court. It investigates federal crimes and runs the federal prison system.",
    "note": null,
    "agencies": [
      "Federal Bureau of Investigation (FBI)",
      "Drug Enforcement Administration (DEA)",
      "Bureau of Alcohol, Tobacco, Firearms and Explosives (ATF)",
      "Federal Bureau of Prisons",
      "U.S. Marshals Service",
      "U.S. Attorneys’ Offices"
    ],
    "employees": {
      "count": 107944,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Robert F. Kennedy Department of Justice Building",
    "address": "950 Pennsylvania Avenue NW, Washington, DC",
    "oversight": {
      "house": [
        "House Judiciary"
      ],
      "senate": [
        "Senate Judiciary"
      ]
    },
    "website": "https://www.justice.gov",
    "photo": "/gov/justice.jpg"
  },
  {
    "id": "interior",
    "name": "Department of the Interior",
    "short": "Interior",
    "founded": "1849",
    "headTitle": "Secretary of the Interior",
    "headName": "Doug Burgum",
    "acting": false,
    "headSource": "https://www.doi.gov/secretary-doug-burgum",
    "does": "Manages federal public lands, national parks, and natural resources such as water, minerals, and wildlife. It also carries out the federal government’s responsibilities to Native American tribes.",
    "note": null,
    "agencies": [
      "National Park Service",
      "U.S. Fish and Wildlife Service",
      "U.S. Geological Survey",
      "Bureau of Land Management",
      "Bureau of Reclamation",
      "Bureau of Indian Affairs"
    ],
    "employees": {
      "count": 59498,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Stewart Lee Udall Department of the Interior Building",
    "address": "1849 C Street NW, Washington, DC",
    "oversight": {
      "house": [
        "House Natural Resources"
      ],
      "senate": [
        "Senate Energy and Natural Resources"
      ]
    },
    "website": "https://www.doi.gov",
    "photo": "/gov/interior.jpg"
  },
  {
    "id": "agriculture",
    "name": "Department of Agriculture",
    "short": "Agriculture",
    "founded": "1862",
    "headTitle": "Secretary of Agriculture",
    "headName": "Brooke Rollins",
    "acting": false,
    "headSource": "https://www.whitehouse.gov/administration/the-cabinet/",
    "does": "Supports farmers and ranchers, inspects meat and poultry for safety, and manages the national forests. It also runs food assistance programs such as SNAP and school meals.",
    "note": null,
    "agencies": [
      "Forest Service",
      "Food Safety and Inspection Service",
      "Food and Nutrition Service (SNAP, school meals)",
      "Animal and Plant Health Inspection Service",
      "Natural Resources Conservation Service",
      "Farm Service Agency"
    ],
    "employees": {
      "count": 76909,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Jamie L. Whitten Building",
    "address": "1400 Independence Avenue SW, Washington, DC",
    "oversight": {
      "house": [
        "House Agriculture"
      ],
      "senate": [
        "Senate Agriculture, Nutrition, and Forestry"
      ]
    },
    "website": "https://www.usda.gov",
    "photo": "/gov/agriculture.jpg"
  },
  {
    "id": "commerce",
    "name": "Department of Commerce",
    "short": "Commerce",
    "founded": "1903, as the Department of Commerce and Labor",
    "headTitle": "Secretary of Commerce",
    "headName": "Howard Lutnick",
    "acting": false,
    "headSource": "https://www.whitehouse.gov/administration/the-cabinet/",
    "does": "Collects economic and population data, including the census every ten years, and promotes U.S. business and trade. It also forecasts the weather and grants patents and trademarks.",
    "note": null,
    "agencies": [
      "U.S. Census Bureau",
      "National Oceanic and Atmospheric Administration (NOAA, includes the National Weather Service)",
      "U.S. Patent and Trademark Office",
      "National Institute of Standards and Technology",
      "Bureau of Economic Analysis"
    ],
    "employees": {
      "count": 41300,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Herbert C. Hoover Building",
    "address": "1401 Constitution Avenue NW, Washington, DC",
    "oversight": {
      "house": [
        "House Energy and Commerce"
      ],
      "senate": [
        "Senate Commerce, Science, and Transportation"
      ]
    },
    "website": "https://www.commerce.gov",
    "photo": "/gov/commerce.jpg"
  },
  {
    "id": "labor",
    "name": "Department of Labor",
    "short": "Labor",
    "founded": "1913",
    "headTitle": "Secretary of Labor",
    "headName": "Keith Sonderling",
    "acting": false,
    "headSource": "https://www.dol.gov/agencies/osec",
    "does": "Enforces federal rules on wages, working hours, and workplace safety. It also publishes the monthly jobs and inflation numbers and oversees unemployment insurance and job training programs.",
    "note": null,
    "agencies": [
      "Occupational Safety and Health Administration (OSHA)",
      "Bureau of Labor Statistics",
      "Wage and Hour Division",
      "Mine Safety and Health Administration",
      "Employment and Training Administration"
    ],
    "employees": {
      "count": 11168,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Frances Perkins Building",
    "address": "200 Constitution Avenue NW, Washington, DC",
    "oversight": {
      "house": [
        "House Education and Workforce"
      ],
      "senate": [
        "Senate Health, Education, Labor, and Pensions"
      ]
    },
    "website": "https://www.dol.gov",
    "photo": "/gov/labor.jpg"
  },
  {
    "id": "hhs",
    "name": "Department of Health and Human Services",
    "short": "Health and Human Services",
    "founded": "1953, as the Department of Health, Education, and Welfare",
    "headTitle": "Secretary of Health and Human Services",
    "headName": "Robert F. Kennedy Jr.",
    "acting": false,
    "headSource": "https://www.whitehouse.gov/administration/the-cabinet/",
    "does": "Runs federal health programs, including Medicare and Medicaid, and funds medical research. It also approves medicines and tracks disease outbreaks.",
    "note": null,
    "agencies": [
      "Centers for Disease Control and Prevention (CDC)",
      "Food and Drug Administration (FDA)",
      "National Institutes of Health (NIH)",
      "Centers for Medicare & Medicaid Services (CMS)",
      "Indian Health Service"
    ],
    "employees": {
      "count": 72959,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Hubert H. Humphrey Building",
    "address": "200 Independence Avenue SW, Washington, DC",
    "oversight": {
      "house": [
        "House Energy and Commerce",
        "House Ways and Means"
      ],
      "senate": [
        "Senate Health, Education, Labor, and Pensions",
        "Senate Finance"
      ]
    },
    "website": "https://www.hhs.gov",
    "photo": "/gov/hhs.jpg"
  },
  {
    "id": "hud",
    "name": "Department of Housing and Urban Development",
    "short": "Housing and Urban Development",
    "founded": "1965",
    "headTitle": "Secretary of Housing and Urban Development",
    "headName": "Scott Turner",
    "acting": false,
    "headSource": "https://www.hud.gov/aboutus/leadership",
    "does": "Helps people afford housing through rental assistance, public housing, and government-backed home loans. It also enforces federal laws against housing discrimination.",
    "note": "The department has been moving its headquarters to Alexandria, Virginia. Its own contact page still lists this building.",
    "agencies": [
      "Federal Housing Administration (FHA)",
      "Government National Mortgage Association (Ginnie Mae)",
      "Office of Public and Indian Housing",
      "Office of Fair Housing and Equal Opportunity",
      "Office of Community Planning and Development"
    ],
    "employees": {
      "count": 5845,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Robert C. Weaver Federal Building",
    "address": "451 7th Street SW, Washington, DC",
    "oversight": {
      "house": [
        "House Financial Services"
      ],
      "senate": [
        "Senate Banking, Housing, and Urban Affairs"
      ]
    },
    "website": "https://www.hud.gov",
    "photo": "/gov/hud.jpg"
  },
  {
    "id": "transportation",
    "name": "Department of Transportation",
    "short": "Transportation",
    "founded": "1966",
    "headTitle": "Secretary of Transportation",
    "headName": "Sean Duffy",
    "acting": false,
    "headSource": "https://www.whitehouse.gov/administration/the-cabinet/",
    "does": "Sets safety rules for planes, cars, trucks, trains, and pipelines, and runs the air traffic control system. It also sends federal money to states for highways, transit, and airports.",
    "note": null,
    "agencies": [
      "Federal Aviation Administration (FAA)",
      "Federal Highway Administration",
      "National Highway Traffic Safety Administration (NHTSA)",
      "Federal Railroad Administration",
      "Federal Transit Administration",
      "Federal Motor Carrier Safety Administration"
    ],
    "employees": {
      "count": 52754,
      "note": "Civilians only, as of September 2026."
    },
    "building": "U.S. Department of Transportation Headquarters",
    "address": "1200 New Jersey Avenue SE, Washington, DC",
    "oversight": {
      "house": [
        "House Transportation and Infrastructure"
      ],
      "senate": [
        "Senate Commerce, Science, and Transportation"
      ]
    },
    "website": "https://www.transportation.gov",
    "photo": "/gov/transportation.jpg"
  },
  {
    "id": "energy",
    "name": "Department of Energy",
    "short": "Energy",
    "founded": "1977",
    "headTitle": "Secretary of Energy",
    "headName": "Chris Wright",
    "acting": false,
    "headSource": "https://www.energy.gov/person/chris-wright",
    "does": "Maintains the country’s nuclear weapons and cleans up former weapons sites. It also funds energy and science research through a network of national laboratories.",
    "note": null,
    "agencies": [
      "National Nuclear Security Administration",
      "National Laboratories (17 labs)",
      "Federal Energy Regulatory Commission (independent commission within the department)",
      "Energy Information Administration",
      "Office of Science"
    ],
    "employees": {
      "count": 13441,
      "note": "Civilians only, as of September 2026."
    },
    "building": "James V. Forrestal Building",
    "address": "1000 Independence Avenue SW, Washington, DC",
    "oversight": {
      "house": [
        "House Energy and Commerce"
      ],
      "senate": [
        "Senate Energy and Natural Resources"
      ]
    },
    "website": "https://www.energy.gov",
    "photo": "/gov/energy.jpg"
  },
  {
    "id": "education",
    "name": "Department of Education",
    "short": "Education",
    "founded": "1979",
    "headTitle": "Secretary of Education",
    "headName": "Linda McMahon",
    "acting": false,
    "headSource": "https://www.whitehouse.gov/administration/the-cabinet/",
    "does": "Distributes federal money to schools and colleges and manages federal student loans and grants. It also collects national education data and enforces civil rights laws in schools.",
    "note": null,
    "agencies": [
      "Federal Student Aid",
      "Office for Civil Rights",
      "Office of Elementary and Secondary Education",
      "Office of Special Education and Rehabilitative Services",
      "Institute of Education Sciences"
    ],
    "employees": {
      "count": 2303,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Lyndon Baines Johnson Department of Education Building",
    "address": "400 Maryland Avenue SW, Washington, DC",
    "oversight": {
      "house": [
        "House Education and Workforce"
      ],
      "senate": [
        "Senate Health, Education, Labor, and Pensions"
      ]
    },
    "website": "https://www.ed.gov",
    "photo": "/gov/education.jpg"
  },
  {
    "id": "va",
    "name": "Department of Veterans Affairs",
    "short": "Veterans Affairs",
    "founded": "1989. It replaced the Veterans Administration of 1930.",
    "headTitle": "Secretary of Veterans Affairs",
    "headName": "Doug Collins",
    "acting": false,
    "headSource": "https://www.whitehouse.gov/administration/the-cabinet/",
    "does": "Provides health care to military veterans through its own hospitals and clinics. It also pays veterans’ disability, education, and home loan benefits and runs national cemeteries.",
    "note": null,
    "agencies": [
      "Veterans Health Administration",
      "Veterans Benefits Administration",
      "National Cemetery Administration",
      "Board of Veterans’ Appeals"
    ],
    "employees": {
      "count": 448850,
      "note": "Civilians only, as of September 2026."
    },
    "building": "Veterans Affairs Central Office",
    "address": "810 Vermont Avenue NW, Washington, DC",
    "oversight": {
      "house": [
        "House Veterans’ Affairs"
      ],
      "senate": [
        "Senate Veterans’ Affairs"
      ]
    },
    "website": "https://www.va.gov",
    "photo": "/gov/va.jpg"
  },
  {
    "id": "dhs",
    "name": "Department of Homeland Security",
    "short": "Homeland Security",
    "founded": "2002",
    "headTitle": "Secretary of Homeland Security",
    "headName": "Markwayne Mullin",
    "acting": false,
    "headSource": "https://www.dhs.gov/leadership",
    "does": "Guards the borders, enforces immigration law, and screens passengers at airports. It also responds to natural disasters and protects the President.",
    "note": null,
    "agencies": [
      "U.S. Customs and Border Protection (CBP)",
      "U.S. Immigration and Customs Enforcement (ICE)",
      "Transportation Security Administration (TSA)",
      "Federal Emergency Management Agency (FEMA)",
      "U.S. Coast Guard",
      "U.S. Secret Service"
    ],
    "employees": {
      "count": 225910,
      "note": "Civilians only, as of September 2026."
    },
    "building": "St. Elizabeths West Campus",
    "address": "2707 Martin Luther King Jr. Avenue SE, Washington, DC",
    "oversight": {
      "house": [
        "House Homeland Security"
      ],
      "senate": [
        "Senate Homeland Security and Governmental Affairs"
      ]
    },
    "website": "https://www.dhs.gov",
    "photo": "/gov/dhs.jpg"
  }
]

// What Congress can do to every department above.
export const CONGRESS_CHECKS = [
  { title: 'It creates them', body: 'A department exists because Congress passed a law making it, and only a law can close one.' },
  { title: 'It pays for them', body: 'Each year Congress votes on how much money every department may spend. Without that vote, much of a department shuts down.' },
  { title: 'The Senate confirms the leaders', body: 'The President’s pick to run a department takes the job only after a majority of senators vote yes.' },
  { title: 'Its committees ask the questions', body: 'Committees in the House and Senate call department leaders to testify and can demand documents.' },
]

export const INDEPENDENT_AGENCIES = [
  {
    "name": "Environmental Protection Agency",
    "does": "Writes and enforces rules that limit pollution of air, water, and land.",
    "headName": "Lee Zeldin",
    "headTitle": "Administrator",
    "acting": false
  },
  {
    "name": "National Aeronautics and Space Administration",
    "does": "Runs the country's civilian space program and does research on space, flight, and Earth science.",
    "headName": "Jared Isaacman",
    "headTitle": "Administrator",
    "acting": false
  },
  {
    "name": "Central Intelligence Agency",
    "does": "Collects and analyzes information about other countries to inform the President and national security officials.",
    "headName": "John Ratcliffe",
    "headTitle": "Director",
    "acting": false
  },
  {
    "name": "Social Security Administration",
    "does": "Pays retirement, disability, and survivor benefits and issues Social Security numbers.",
    "headName": "Frank Bisignano",
    "headTitle": "Commissioner",
    "acting": false
  },
  {
    "name": "United States Postal Service",
    "does": "Delivers mail and packages to every address in the country and pays for its operations mainly through postage rather than taxes.",
    "headName": "David Steiner",
    "headTitle": "Postmaster General",
    "acting": false
  }
]

export const GOV_SOURCES = [
  { label: 'The White House, the Cabinet', url: "https://www.whitehouse.gov/administration/the-cabinet/" },
  { label: 'USA.gov agency index', url: "https://www.usa.gov/agency-index" },
  { label: 'OPM federal workforce data', url: "https://data.opm.gov/explore-data/analytics/workforce-size-and-composition" },
]

// Photo credits by file name (public/gov/credits.json is the full record).
export const PHOTO_CREDITS = {
  "state.jpg": {
    "author": "U.S. Department of State",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Exterior_of_the_United_States_Department_of_State_Harry_S._Truman_Building,_Washington,_D.C.,_spring_2024_-_15.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "treasury.jpg": {
    "author": "Carol M. Highsmith (Library of Congress)",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:U.S._Treasury_Department_Building,_Washington,_D.C_LCCN2011635063.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "defense.jpg": {
    "author": "Air Force Staff Sgt. Brittany A. Chase, U.S. Department of Defense",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Aerial_Closeup_of_the_Pentagon,_May_11,_2021.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "justice.jpg": {
    "author": "APK",
    "license": "CC BY 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Robert_F._Kennedy_Department_of_Justice_Building.jpg",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0"
  },
  "interior.jpg": {
    "author": "ajay_suresh",
    "license": "CC BY 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:United_States_Department_of_the_Interior_-_Main_Interior_Building_(55267117420).jpg",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0"
  },
  "agriculture.jpg": {
    "author": "U.S. Department of Agriculture",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Jamie_L._Whitten_Federal_Building_20170526-OC-LSC-0022_(34206448083).jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "commerce.jpg": {
    "author": "Carol M. Highsmith (Library of Congress)",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Exterior,_Herbert_C._Hoover_Building,_U.S._Department_of_Commerce,_Washington,_D.C_LCCN2010719582.tif",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "labor.jpg": {
    "author": "Ed Brown",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:US_Dept_of_Labor.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "hhs.jpg": {
    "author": "Carol M. Highsmith (Library of Congress)",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Hubert_H._Humphrey_Building,_located_at_the_foot_of_Capitol_Hill,_Washington,_D.C_LCCN2013634632.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "hud.jpg": {
    "author": "U.S. Dept. of Housing and Urban Development (HUD)",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Robert_C._Weaver_Federal_Building_-_51667649641.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "transportation.jpg": {
    "author": "Aude",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Usdot_headquarters.jpg",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0"
  },
  "energy.jpg": {
    "author": "Carol M. Highsmith (Library of Congress)",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:The_James_Forrestal_Building,_headquarters_of_the_U.S._Department_of_Energy_on_Independence_Avenue,_Washington,_D.C_LCCN2011635887.tif",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "education.jpg": {
    "author": "Carol M. Highsmith (Library of Congress)",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Lyndon_Baines_Johnson_Federal_Building,_Washington,_D.C_LCCN2016648206.tif",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "va.jpg": {
    "author": "APK",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Veterans_Administration_Building.jpg",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  "dhs.jpg": {
    "author": "Tia Duffour, U.S. Department of Homeland Security",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:DHS_St_Elizabeth%27s_Building_1.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "primer-congress.jpg": {
    "author": "Noclip",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Capitol_Building_Full_View.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "primer-reps.jpg": {
    "author": "United States House of Representatives, Office of the Speaker",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:United_States_House_of_Representatives_chamber.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "primer-bill.jpg": {
    "author": "LBJ Presidential Library",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:The_Civil_Rights_Act_of_1964,_signed_by_President_Lyndon_B._Johnson_on_July_2,_1964_as_photographed_on_July_2,_2024_-_2.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "primer-vote.jpg": {
    "author": "U.S. Senate Photo Studio",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:111th_US_Senate_class_photo.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  },
  "primer-law.jpg": {
    "author": "Cecil Stoughton, White House Press Office",
    "license": "Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Lyndon_Johnson_signing_Civil_Rights_Act,_July_2,_1964.jpg",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/"
  }
}
