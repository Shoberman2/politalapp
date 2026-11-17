// What is inside each executive department and how Congress shapes it, for
// /government. Researched from official pages on GOV_DEEP_AS_OF: each agency's
// own leadership page where it could be read, otherwise whitehouse.gov,
// congress.gov nomination records or usa.gov (the `headSource` of each entry
// is the page actually used). A `headName` of null means the holder could not
// be confirmed; the page says so instead of guessing. This file is the source
// of truth and is edited directly; a scheduled agent re-checks it every month
// following docs/government-recheck.md.

export const GOV_DEEP_AS_OF = "2026-11-17"

// Keyed by department id (src/data/government.js).
export const DEPARTMENT_DETAIL = {
  "state": {
    "components": [
      {
        "name": "Bureau of Consular Affairs",
        "does": "Issues U.S. passports, decides visa applications from foreigners, and helps Americans who get into trouble abroad.",
        "headTitle": "Assistant Secretary",
        "headName": "Mora Namdar",
        "acting": false,
        "headSource": "https://www.state.gov/bureaus-offices/under-secretary-for-management/bureau-of-consular-affairs/",
        "website": "https://travel.state.gov/",
        "note": null
      },
      {
        "name": "Bureau of Diplomatic Security",
        "does": "Protects U.S. embassies, diplomats and visiting foreign officials, and investigates passport and visa fraud.",
        "headTitle": "Assistant Secretary",
        "headName": "Todd Wilcox",
        "acting": false,
        "headSource": "https://www.state.gov/leadership-bureau-of-diplomatic-security/",
        "website": "https://www.state.gov/bureaus-offices/under-secretary-for-management/bureau-of-diplomatic-security/",
        "note": null
      },
      {
        "name": "Bureau of Population, Refugees, and Migration (PRM)",
        "does": "Handles U.S. policy on refugees and migration, including the program that admits refugees to the United States.",
        "headTitle": "Senior Bureau Official",
        "headName": "Adam Zerbinopoulos",
        "acting": true,
        "headSource": "https://www.state.gov/bureaus-offices/under-secretary-for-foreign-assistance-humanitarian-affairs-and-religious-freedom/bureau-of-population-refugees-and-migration/",
        "website": "https://www.state.gov/bureaus-offices/under-secretary-for-foreign-assistance-humanitarian-affairs-and-religious-freedom/bureau-of-population-refugees-and-migration/",
        "note": "There is no Senate-confirmed Assistant Secretary. A Senior Bureau Official runs the bureau in the meantime."
      },
      {
        "name": "Bureau of International Narcotics and Law Enforcement Affairs (INL)",
        "does": "Works with other countries to fight drug trafficking and organized crime before it reaches the United States.",
        "headTitle": "Assistant Secretary",
        "headName": "F. Cartwright Weiland",
        "acting": false,
        "headSource": "https://www.state.gov/leadership-bureau-of-international-narcotics-and-law-enforcement-affairs/",
        "website": "https://www.state.gov/bureaus-offices/under-secretary-for-arms-control-and-international-security-affairs/bureau-of-international-narcotics-and-law-enforcement-affairs/",
        "note": null
      },
      {
        "name": "Bureau of Educational and Cultural Affairs (ECA)",
        "does": "Runs exchange programs such as the Fulbright Program that send Americans abroad and bring foreign students and professionals to the United States.",
        "headTitle": "Assistant Secretary",
        "headName": "Cate Dillon",
        "acting": false,
        "headSource": "https://www.state.gov/bureaus-offices/under-secretary-for-public-diplomacy-and-public-affairs/bureau-of-educational-and-cultural-affairs/",
        "website": "https://eca.state.gov/",
        "note": null
      },
      {
        "name": "U.S. Mission to the United Nations (USUN)",
        "does": "Represents the United States at the United Nations and casts the U.S. vote in the Security Council.",
        "headTitle": "U.S. Representative to the United Nations",
        "headName": "Mike Waltz",
        "acting": false,
        "headSource": "https://usun.usmission.gov/",
        "website": "https://usun.usmission.gov/",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "National Security, Department of State, and Related Programs appropriations bill (called the State, Foreign Operations bill before 2025)",
      "laws": [
        {
          "name": "State Department Basic Authorities Act of 1956",
          "what": "Sets out the basic powers and structure of the department, including what the Secretary of State is allowed to do."
        },
        {
          "name": "Foreign Service Act of 1980",
          "what": "Creates the rules for hiring, promoting and posting the diplomats who staff U.S. embassies."
        },
        {
          "name": "Foreign Assistance Act of 1961",
          "what": "Governs how the United States gives aid to other countries, work now largely run from inside the State Department."
        }
      ],
      "confirmed": "The Secretary, the Deputy Secretaries, the Under Secretaries, the Assistant Secretaries and every U.S. ambassador must be confirmed by the Senate.",
      "source": "https://appropriations.house.gov/subcommittees/national-security-department-state-and-related-programs/jurisdiction"
    }
  },
  "treasury": {
    "components": [
      {
        "name": "Internal Revenue Service (IRS)",
        "does": "Collects federal taxes, processes tax returns and refunds, and enforces the tax laws.",
        "headTitle": "Commissioner",
        "headName": null,
        "acting": false,
        "headSource": "https://www.irs.gov/about-irs/irs-organization",
        "website": "https://www.irs.gov/",
        "note": "The IRS lists the Commissioner post as vacant. Frank J. Bisignano runs the agency day to day as Chief Executive Officer, a title created in October 2025 that the Senate does not confirm."
      },
      {
        "name": "United States Mint",
        "does": "Makes the nation’s coins and guards the government’s gold reserves, including Fort Knox.",
        "headTitle": "Director",
        "headName": "Paul Hollis",
        "acting": false,
        "headSource": "https://www.usmint.gov/about/leadership/director",
        "website": "https://www.usmint.gov/",
        "note": "Last checked against a February 2026 document."
      },
      {
        "name": "Bureau of Engraving and Printing (BEP)",
        "does": "Designs and prints all U.S. paper money.",
        "headTitle": "Director",
        "headName": "Michael Brown",
        "acting": true,
        "headSource": "https://www.bep.gov/about-bep/organization/office-of-the-director",
        "website": "https://www.bep.gov/",
        "note": null
      },
      {
        "name": "Bureau of the Fiscal Service",
        "does": "Pays the government’s bills, sends out federal payments such as Social Security and tax refunds, and manages the national debt and savings bonds.",
        "headTitle": "Commissioner",
        "headName": "Joseph Gioeli III",
        "acting": true,
        "headSource": "https://www.fiscal.treasury.gov/about/leadership.html",
        "website": "https://www.fiscal.treasury.gov/",
        "note": null
      },
      {
        "name": "Office of the Comptroller of the Currency (OCC)",
        "does": "Charters and supervises national banks to make sure they are run safely and treat customers fairly.",
        "headTitle": "Comptroller of the Currency",
        "headName": "Jonathan V. Gould",
        "acting": false,
        "headSource": "https://www.occ.treas.gov/about/who-we-are/leadership/index-leadership.html",
        "website": "https://www.occ.treas.gov/",
        "note": null
      },
      {
        "name": "Financial Crimes Enforcement Network (FinCEN)",
        "does": "Collects reports from banks about suspicious transactions and uses them to help catch money laundering and other financial crimes.",
        "headTitle": "Director",
        "headName": "Jenna Casanova",
        "acting": true,
        "headSource": "https://bankingjournal.aba.com/2026/07/gacki-leaving-fincen-for-private-sector-job/",
        "website": "https://www.fincen.gov/",
        "note": "From a July 2026 news report. FinCEN publishes no leadership page."
      },
      {
        "name": "Alcohol and Tobacco Tax and Trade Bureau (TTB)",
        "does": "Collects federal taxes on alcohol, tobacco, firearms and ammunition, and approves alcohol labels.",
        "headTitle": "Administrator",
        "headName": "Mary G. Ryan",
        "acting": false,
        "headSource": "https://www.ttb.gov/about-ttb",
        "website": "https://www.ttb.gov/",
        "note": null
      },
      {
        "name": "Office of Foreign Assets Control (OFAC)",
        "does": "Enforces U.S. economic sanctions by blocking money and trade with targeted countries, companies and people.",
        "headTitle": "Director",
        "headName": "Bradley T. Smith",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/11/16/2026-23208/notice-of-ofac-sanctions-actions",
        "website": "https://ofac.treasury.gov/",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "Financial Services and General Government appropriations bill",
      "laws": [
        {
          "name": "Act of September 2, 1789 (establishing the Treasury Department)",
          "what": "One of the first laws Congress passed, it created the department to manage the government’s money."
        },
        {
          "name": "Internal Revenue Code",
          "what": "The federal tax law written by Congress that the IRS must carry out."
        },
        {
          "name": "Bank Secrecy Act of 1970",
          "what": "Requires banks to keep records and report suspicious activity, which is the basis for Treasury’s work against money laundering."
        }
      ],
      "confirmed": "The Secretary, the Deputy Secretary, the Under Secretaries, most Assistant Secretaries, the IRS Commissioner, the Comptroller of the Currency and the Director of the Mint must be confirmed by the Senate.",
      "source": "https://appropriations.house.gov/subcommittees/financial-services-and-general-government-0/jurisdiction"
    }
  },
  "defense": {
    "components": [
      {
        "name": "Department of the Army",
        "does": "Organizes, trains and equips the nation’s land forces, including the Army Reserve and Army National Guard.",
        "headTitle": "Secretary of the Army",
        "headName": "Adam Telle",
        "acting": true,
        "headSource": "https://federalnewsnetwork.com/army/2026/09/trump-names-adam-telle-as-acting-army-secretary-following-the-departure-of-dan-driscoll/",
        "website": "https://www.army.mil/",
        "note": "Secretary Dan Driscoll resigned in August 2026. From September 2026 news reports."
      },
      {
        "name": "Department of the Navy (includes the Marine Corps)",
        "does": "Organizes, trains and equips the Navy and the Marine Corps.",
        "headTitle": "Secretary of the Navy",
        "headName": "Hung Cao",
        "acting": true,
        "headSource": "https://www.defensedaily.com/cao-picks-rucker-to-lead-pae-maritime/navy-usmc/",
        "website": "https://www.navy.mil/",
        "note": "Secretary John Phelan left in April 2026. Cao was nominated for the permanent job in September 2026."
      },
      {
        "name": "Department of the Air Force (includes the Space Force)",
        "does": "Organizes, trains and equips the Air Force and the Space Force.",
        "headTitle": "Secretary of the Air Force",
        "headName": "Troy E. Meink",
        "acting": false,
        "headSource": "https://www.af.mil/News/Article-Display/Article/4600887/meink-offers-blueprint-for-modernizing-air-space-forces-affordably/",
        "website": "https://www.af.mil/",
        "note": null
      },
      {
        "name": "Joint Chiefs of Staff",
        "does": "The top uniformed officers of each military service, who advise the President and the Secretary on military matters.",
        "headTitle": "Chairman of the Joint Chiefs of Staff",
        "headName": "Gen. Dan Caine",
        "acting": false,
        "headSource": "https://www.jcs.mil/",
        "website": "https://www.jcs.mil/",
        "note": "Last official confirmation found: July 2026."
      },
      {
        "name": "National Security Agency (NSA)",
        "does": "Collects foreign electronic intelligence and protects U.S. government computer systems from spying and attack.",
        "headTitle": "Director",
        "headName": "Joshua Rudd",
        "acting": false,
        "headSource": "https://www.securityweek.com/senate-confirms-joshua-rudd-to-lead-nsa-and-us-cyber-command/",
        "website": "https://www.nsa.gov/",
        "note": "Confirmed by the Senate in March 2026. The director also commands U.S. Cyber Command."
      },
      {
        "name": "Defense Health Agency (DHA)",
        "does": "Runs military hospitals and clinics and the TRICARE health plan for service members, retirees and their families.",
        "headTitle": "Director",
        "headName": "Vice Adm. Darin K. Via",
        "acting": false,
        "headSource": "https://dha.mil/News/2026/02/12/18/57/We-Are-a-Combat-Support-Agency-says-new-DHA-Director",
        "website": "https://www.dha.mil/",
        "note": null
      },
      {
        "name": "U.S. Army Corps of Engineers (USACE)",
        "does": "Builds and maintains dams, levees, harbors and waterways, and builds facilities for the military.",
        "headTitle": "Chief of Engineers and Commanding General",
        "headName": "Lt. Gen. William H. \"Butch\" Graham Jr.",
        "acting": false,
        "headSource": "https://www.army.mil/article/296434/hudson_assumes_command_of_usace_pacific_ocean_division",
        "website": "https://www.usace.army.mil/",
        "note": "Its civil works budget comes from the Energy and Water spending bill, not the Defense bill."
      }
    ],
    "congress": {
      "fundedBy": "Department of Defense appropriations bill (military bases and housing are funded in the separate Military Construction and Veterans Affairs bill, and the Army Corps of Engineers’ civil works in the Energy and Water bill)",
      "laws": [
        {
          "name": "National Defense Authorization Act (NDAA)",
          "what": "A law Congress passes every year that sets military policy, troop levels and pay, and says what the department is allowed to spend money on."
        },
        {
          "name": "National Security Act of 1947",
          "what": "Combined the separate military departments under one Secretary of Defense and created the Air Force as its own service."
        },
        {
          "name": "Goldwater-Nichols Act of 1986",
          "what": "Set the modern chain of command, which runs from the President to the Secretary to the regional commanders, and made the Chairman of the Joint Chiefs the top military adviser."
        }
      ],
      "confirmed": "The Secretary, the Deputy Secretary, the Under Secretaries, the Assistant Secretaries, the civilian secretaries of the Army, Navy and Air Force, and every general and admiral, including the Joint Chiefs, must be confirmed by the Senate.",
      "source": "https://appropriations.house.gov/subcommittees/defense-0/jurisdiction"
    }
  },
  "justice": {
    "components": [
      {
        "name": "Federal Bureau of Investigation (FBI)",
        "does": "Investigates federal crimes such as terrorism, spying, cyber attacks, public corruption and kidnapping.",
        "headTitle": "Director",
        "headName": "Kash Patel",
        "acting": false,
        "headSource": "https://www.nextgov.com/ideas/2026/11/new-fbi-better-technology-meet-mission/417140/",
        "website": "https://www.fbi.gov/",
        "note": null
      },
      {
        "name": "Drug Enforcement Administration (DEA)",
        "does": "Enforces federal drug laws and goes after major drug trafficking organizations.",
        "headTitle": "Administrator",
        "headName": "Terrance C. Cole",
        "acting": false,
        "headSource": "https://www.federalregister.gov/agencies/drug-enforcement-administration",
        "website": "https://www.dea.gov/",
        "note": null
      },
      {
        "name": "Bureau of Alcohol, Tobacco, Firearms and Explosives (ATF)",
        "does": "Enforces federal laws on guns, explosives and arson, and licenses gun dealers.",
        "headTitle": "Director",
        "headName": "Robert Cekada",
        "acting": false,
        "headSource": "https://www.federalregister.gov/agencies/alcohol-tobacco-firearms-and-explosives-bureau",
        "website": "https://www.atf.gov/",
        "note": null
      },
      {
        "name": "U.S. Marshals Service (USMS)",
        "does": "Protects federal judges and courthouses, tracks down fugitives, transports federal prisoners and runs the witness protection program.",
        "headTitle": "Director",
        "headName": "Gadyaces S. Serralta",
        "acting": false,
        "headSource": "https://www.usmarshals.gov/who-we-are/about-us/leadership",
        "website": "https://www.usmarshals.gov/",
        "note": null
      },
      {
        "name": "Federal Bureau of Prisons (BOP)",
        "does": "Runs the federal prison system and is responsible for the people held in it.",
        "headTitle": "Director",
        "headName": "William K. Marshall III",
        "acting": false,
        "headSource": "https://www.bop.gov/about/agency/bio_dir.jsp",
        "website": "https://www.bop.gov/",
        "note": null
      },
      {
        "name": "U.S. Attorneys’ Offices",
        "does": "The 93 U.S. Attorneys are the federal government’s main prosecutors, bringing criminal cases and representing the United States in court in each district.",
        "headTitle": "Director, Executive Office for U.S. Attorneys",
        "headName": "Francey Hakes",
        "acting": false,
        "headSource": "https://www.justice.gov/usao/eousa",
        "website": "https://www.justice.gov/usao",
        "note": "Each U.S. Attorney leads one district and reports to the Attorney General. The Director named here runs the central support office."
      },
      {
        "name": "Executive Office for Immigration Review (EOIR)",
        "does": "Runs the immigration courts, where judges decide whether a noncitizen may stay in the country or must be deported.",
        "headTitle": "Director",
        "headName": "Sirce E. Owen",
        "acting": true,
        "headSource": "https://www.justice.gov/eoir/office-of-the-director",
        "website": "https://www.justice.gov/eoir",
        "note": null
      },
      {
        "name": "Civil Rights Division",
        "does": "Enforces federal laws against discrimination in areas such as voting, housing, jobs, schools and policing.",
        "headTitle": "Assistant Attorney General",
        "headName": "Craig W. Trainor",
        "acting": true,
        "headSource": "https://www.justice.gov/crt",
        "website": "https://www.justice.gov/crt",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "Commerce, Justice, Science, and Related Agencies appropriations bill",
      "laws": [
        {
          "name": "Judiciary Act of 1789",
          "what": "Created the office of Attorney General and the U.S. Attorneys and U.S. Marshals in each district."
        },
        {
          "name": "Act to Establish the Department of Justice (1870)",
          "what": "Created the department itself and put the Attorney General in charge of the government’s lawyers."
        },
        {
          "name": "Controlled Substances Act of 1970",
          "what": "Sorts drugs into legal categories and sets the federal drug crimes that the DEA and federal prosecutors enforce."
        }
      ],
      "confirmed": "The Attorney General, the Deputy and Associate Attorneys General, the Solicitor General, the Assistant Attorneys General, the directors of the FBI, ATF and Marshals Service, the DEA Administrator, and the 93 U.S. Attorneys and 94 U.S. Marshals are all posts that require Senate confirmation.",
      "source": "https://appropriations.house.gov/subcommittees/commerce-justice-science-and-related-agencies-0/jurisdiction"
    }
  },
  "interior": {
    "components": [
      {
        "name": "National Park Service (NPS)",
        "does": "Runs the national parks, monuments and historic sites and keeps them open to visitors.",
        "headTitle": "Director",
        "headName": "Jessica Bowron",
        "acting": true,
        "headSource": "https://www.nps.gov/aboutus/contactinformation.htm",
        "website": "https://www.nps.gov/",
        "note": "There is no Senate-confirmed Director. A nominee was withdrawn in April 2026."
      },
      {
        "name": "Bureau of Land Management (BLM)",
        "does": "Manages about 245 million acres of public land, mostly in the West, for grazing, energy, mining, recreation and conservation.",
        "headTitle": "Director",
        "headName": "Stevan Pearce",
        "acting": false,
        "headSource": "https://www.blm.gov/leadership",
        "website": "https://www.blm.gov/",
        "note": null
      },
      {
        "name": "U.S. Fish and Wildlife Service (FWS)",
        "does": "Protects endangered species and migratory birds and runs the national wildlife refuges.",
        "headTitle": "Director",
        "headName": "Brian Nesvik",
        "acting": false,
        "headSource": "https://www.fws.gov/about/leadership",
        "website": "https://www.fws.gov/",
        "note": null
      },
      {
        "name": "U.S. Geological Survey (USGS)",
        "does": "Studies and maps the nation’s land, water and minerals and monitors earthquakes, volcanoes and floods.",
        "headTitle": "Director",
        "headName": "Ned Mamula",
        "acting": false,
        "headSource": "https://www.usgs.gov/about/key-officials",
        "website": "https://www.usgs.gov/",
        "note": null
      },
      {
        "name": "Bureau of Indian Affairs (BIA)",
        "does": "Carries out the federal government’s duties to tribal nations, including managing land held in trust and funding tribal services.",
        "headTitle": "Director",
        "headName": "Bryan Mercier",
        "acting": false,
        "headSource": "https://www.bia.gov/leadership",
        "website": "https://www.bia.gov/",
        "note": "The Director is a career post under the Assistant Secretary for Indian Affairs, William Kirkland."
      },
      {
        "name": "Bureau of Reclamation",
        "does": "Runs dams, canals and reservoirs that supply water and hydropower across 17 western states, including Hoover Dam.",
        "headTitle": "Commissioner",
        "headName": "Aubrey Bettencourt",
        "acting": true,
        "headSource": "https://www.usbr.gov/newsroom/biography/1",
        "website": "https://www.usbr.gov/",
        "note": "There is no Senate-confirmed Commissioner. Reclamation is funded by the Energy and Water spending bill, not the Interior bill."
      },
      {
        "name": "Marine Minerals Administration",
        "does": "Leases offshore areas for oil, gas, wind and minerals and inspects offshore operations for safety.",
        "headTitle": "Director",
        "headName": "Michael D. Olsen",
        "acting": true,
        "headSource": "https://www.boem.gov/about-boem/boem-leadership",
        "website": "https://www.doi.gov/mma-reunification",
        "note": "In 2026 Interior began merging the Bureau of Ocean Energy Management and the Bureau of Safety and Environmental Enforcement into this new agency. The change is still under way."
      },
      {
        "name": "Office of Surface Mining Reclamation and Enforcement (OSMRE)",
        "does": "Regulates coal mining and makes sure mined land is cleaned up and restored.",
        "headTitle": "Director",
        "headName": "Lanny E. Erdos",
        "acting": false,
        "headSource": "https://www.osmre.gov/about/director",
        "website": "https://www.osmre.gov/",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "Interior, Environment, and Related Agencies appropriations bill (except the Bureau of Reclamation, which is funded in the Energy and Water bill)",
      "laws": [
        {
          "name": "Act of March 3, 1849 (establishing the Department of the Interior)",
          "what": "Created the department to handle the nation’s internal affairs, such as public lands and relations with tribes."
        },
        {
          "name": "National Park Service Organic Act of 1916",
          "what": "Created the National Park Service and told it to protect the parks so future generations can enjoy them."
        },
        {
          "name": "Federal Land Policy and Management Act of 1976",
          "what": "Tells the Bureau of Land Management to keep public lands in federal ownership and balance their many uses."
        }
      ],
      "confirmed": "The Secretary, the Deputy Secretary, the Assistant Secretaries, the Solicitor and the heads of most bureaus, including the National Park Service, Bureau of Land Management, Fish and Wildlife Service, Geological Survey, Bureau of Reclamation and Office of Surface Mining, must be confirmed by the Senate.",
      "source": "https://appropriations.house.gov/subcommittees/interior-environment-and-related-agencies-0/jurisdiction"
    }
  },
  "agriculture": {
    "components": [
      {
        "name": "Forest Service",
        "does": "Manages 193 million acres of national forests and grasslands and fights wildfires on them.",
        "headTitle": "Chief",
        "headName": "Tom Schultz",
        "acting": false,
        "headSource": "https://www.fs.usda.gov/about-agency/newsroom/leadership-biographies",
        "website": "https://www.fs.usda.gov/",
        "note": "Part of Agriculture, but funded through the Interior spending bill."
      },
      {
        "name": "Food and Nutrition Administration",
        "does": "Runs federal food aid programs, including SNAP (food stamps), WIC and school lunches.",
        "headTitle": "Administrator",
        "headName": "Shiela Corley",
        "acting": true,
        "headSource": "https://www.fns.usda.gov/about/administrator",
        "website": "https://www.fns.usda.gov/",
        "note": "Renamed from the Food and Nutrition Service in 2026."
      },
      {
        "name": "Food Safety and Inspection Service (FSIS)",
        "does": "Inspects meat, poultry and egg products to make sure they are safe and correctly labeled.",
        "headTitle": "Administrator",
        "headName": "Justin Ransom",
        "acting": false,
        "headSource": "https://www.federalregister.gov/agencies/food-safety-and-inspection-service",
        "website": "https://www.fsis.usda.gov/",
        "note": null
      },
      {
        "name": "Animal and Plant Health Inspection Service (APHIS)",
        "does": "Protects U.S. farms from animal diseases and plant pests, and enforces animal welfare rules.",
        "headTitle": "Administrator",
        "headName": "Kelly Moore",
        "acting": false,
        "headSource": "https://www.federalregister.gov/agencies/animal-and-plant-health-inspection-service",
        "website": "https://www.aphis.usda.gov/",
        "note": null
      },
      {
        "name": "Farm Service Agency (FSA)",
        "does": "Gives farmers and ranchers loans, disaster aid and payments from federal farm programs through local county offices.",
        "headTitle": "Administrator",
        "headName": "William \"Bill\" Beam",
        "acting": false,
        "headSource": "https://www.fsa.usda.gov/about-fsa/fsa-leadership",
        "website": "https://www.fsa.usda.gov/",
        "note": null
      },
      {
        "name": "Natural Resources Conservation Service (NRCS)",
        "does": "Helps farmers and private landowners protect soil, water and wildlife habitat on their land.",
        "headTitle": "Chief",
        "headName": "Colton L. Buckley",
        "acting": false,
        "headSource": "https://www.nrcs.usda.gov/sites/default/files/2026-06/Bio-NRCS-Chief-Colton-Buckley-508.pdf",
        "website": "https://www.nrcs.usda.gov/",
        "note": null
      },
      {
        "name": "Risk Management Agency (RMA)",
        "does": "Runs the federal crop insurance program that protects farmers when crops fail or prices drop.",
        "headTitle": "Administrator",
        "headName": "Pat Swanson",
        "acting": false,
        "headSource": "https://www.rma.usda.gov/about-rma/who-we-are/administrators-message",
        "website": "https://www.rma.usda.gov/",
        "note": null
      },
      {
        "name": "Agricultural Research Service (ARS)",
        "does": "Is USDA’s main in-house science agency, doing research on crops, livestock, nutrition and food safety.",
        "headTitle": "Administrator",
        "headName": "Joon Park",
        "acting": false,
        "headSource": "https://www.ars.usda.gov/about-ars/",
        "website": "https://www.ars.usda.gov/",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "Agriculture, Rural Development, Food and Drug Administration, and Related Agencies appropriations bill (except the Forest Service, which is funded in the Interior bill)",
      "laws": [
        {
          "name": "The farm bill (most recently the Agriculture Improvement Act of 2018)",
          "what": "A large law Congress renews every several years that sets the rules for farm support, crop insurance, conservation and food aid."
        },
        {
          "name": "Food and Nutrition Act of 2008",
          "what": "The law behind SNAP, setting who can get food benefits and how the program is run."
        },
        {
          "name": "Federal Meat Inspection Act",
          "what": "Requires federal inspection of meat sold to the public, which is the basis for USDA’s food safety inspectors."
        }
      ],
      "confirmed": "The Secretary, the Deputy Secretary, the Under Secretaries, the Assistant Secretaries and the General Counsel must be confirmed by the Senate; most agency heads, such as the Forest Service Chief, are appointed without a Senate vote.",
      "source": "https://appropriations.house.gov/subcommittees/agriculture-rural-development-food-and-drug-administration-and-related-agencies/jurisdiction"
    }
  },
  "commerce": {
    "components": [
      {
        "name": "U.S. Census Bureau",
        "does": "Counts everyone in the country every 10 years and publishes data on the population and the economy.",
        "headTitle": "Director",
        "headName": "George M. Cook",
        "acting": true,
        "headSource": "https://www.census.gov/about/leadership.html",
        "website": "https://www.census.gov/",
        "note": "There is no Senate-confirmed Director."
      },
      {
        "name": "National Oceanic and Atmospheric Administration (NOAA)",
        "does": "Forecasts the weather, studies the oceans and climate, and manages ocean fishing.",
        "headTitle": "Administrator",
        "headName": "Dr. Neil Jacobs",
        "acting": false,
        "headSource": "https://www.noaa.gov/leadership",
        "website": "https://www.noaa.gov/",
        "note": null
      },
      {
        "name": "National Weather Service (NWS)",
        "does": "Issues the nation’s weather forecasts and the warnings for hurricanes, tornadoes, floods and other dangerous weather.",
        "headTitle": "Director",
        "headName": "Ken Graham",
        "acting": false,
        "headSource": "https://www.eenews.net/articles/national-weather-service-in-transition-as-hurricane-season-begins/",
        "website": "https://www.weather.gov/",
        "note": "Part of NOAA. Last confirmed from June 2026 news coverage."
      },
      {
        "name": "U.S. Patent and Trademark Office (USPTO)",
        "does": "Grants patents for inventions and registers trademarks for brand names and logos.",
        "headTitle": "Director",
        "headName": "John A. Squires",
        "acting": false,
        "headSource": "https://www.uspto.gov/about-us/executive-biographies",
        "website": "https://www.uspto.gov/",
        "note": null
      },
      {
        "name": "National Institute of Standards and Technology (NIST)",
        "does": "Sets the official U.S. standards for measurement, such as time and weight, and writes technical guidelines including for cybersecurity.",
        "headTitle": "Director",
        "headName": "Arvind Raman",
        "acting": false,
        "headSource": "https://www.nist.gov/director",
        "website": "https://www.nist.gov/",
        "note": null
      },
      {
        "name": "Bureau of Industry and Security (BIS)",
        "does": "Controls the export of sensitive technology, such as advanced computer chips, to protect national security.",
        "headTitle": "Under Secretary of Commerce for Industry and Security",
        "headName": "Jeffrey Kessler",
        "acting": false,
        "headSource": "https://www.bis.gov/about-bis/bis-leadership-and-offices",
        "website": "https://www.bis.gov/",
        "note": null
      },
      {
        "name": "International Trade Administration (ITA)",
        "does": "Helps American companies sell their products abroad and enforces laws against unfairly priced imports.",
        "headTitle": "Under Secretary of Commerce for International Trade",
        "headName": "William Kimmitt",
        "acting": false,
        "headSource": "https://www.trade.gov/about-us",
        "website": "https://www.trade.gov/",
        "note": null
      },
      {
        "name": "Bureau of Economic Analysis (BEA)",
        "does": "Calculates key measures of the economy, including gross domestic product (GDP).",
        "headTitle": "Director",
        "headName": "Vipin Arora",
        "acting": false,
        "headSource": "https://www.bea.gov/about/leadership",
        "website": "https://www.bea.gov/",
        "note": "Appointed by the Secretary. The Senate does not confirm this job."
      },
      {
        "name": "National Telecommunications and Information Administration (NTIA)",
        "does": "Advises the President on internet and telecom policy, manages the federal government’s use of the airwaves, and runs broadband grant programs.",
        "headTitle": "Administrator",
        "headName": "Arielle Roth",
        "acting": false,
        "headSource": "https://www.ntia.gov/office/office-assistant-secretary-oas",
        "website": "https://www.ntia.gov/",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "Commerce, Justice, Science, and Related Agencies appropriations bill",
      "laws": [
        {
          "name": "Act of February 14, 1903 (establishing the Department of Commerce and Labor)",
          "what": "Created the department, which became the separate Department of Commerce in 1913."
        },
        {
          "name": "Title 13 of the U.S. Code (the Census Act)",
          "what": "Tells the Census Bureau how to carry out the count the Constitution requires every 10 years and keeps people’s answers confidential."
        },
        {
          "name": "Export Control Reform Act of 2018",
          "what": "Gives the department the power to restrict exports of technology that could harm national security."
        }
      ],
      "confirmed": "The Secretary, the Deputy Secretary, the Under Secretaries (who lead NOAA, the Patent and Trademark Office, NIST, the Bureau of Industry and Security and the International Trade Administration), the Assistant Secretaries and the Census Director must be confirmed by the Senate.",
      "source": "https://appropriations.house.gov/subcommittees/commerce-justice-science-and-related-agencies-0/jurisdiction"
    }
  },
  "labor": {
    "components": [
      {
        "name": "Occupational Safety and Health Administration (OSHA)",
        "does": "Sets and enforces workplace safety rules and inspects job sites.",
        "headTitle": "Assistant Secretary of Labor for Occupational Safety and Health",
        "headName": "David Keeling",
        "acting": false,
        "headSource": "https://www.dol.gov/general/contact/contact-phonekeypersonnel",
        "website": "https://www.osha.gov/",
        "note": null
      },
      {
        "name": "Bureau of Labor Statistics (BLS)",
        "does": "Measures and publishes the unemployment rate, job growth, wages and inflation (the Consumer Price Index).",
        "headTitle": "Commissioner",
        "headName": "Brett Matsumoto",
        "acting": false,
        "headSource": "https://www.dol.gov/general/contact/contact-phonekeypersonnel",
        "website": "https://www.bls.gov/",
        "note": null
      },
      {
        "name": "Wage and Hour Division (WHD)",
        "does": "Enforces the federal minimum wage, overtime pay, child labor rules and family and medical leave.",
        "headTitle": "Administrator",
        "headName": "Andrew Rogers",
        "acting": false,
        "headSource": "https://www.dol.gov/general/contact/contact-phonekeypersonnel",
        "website": "https://www.dol.gov/agencies/whd",
        "note": null
      },
      {
        "name": "Mine Safety and Health Administration (MSHA)",
        "does": "Inspects mines and enforces safety and health rules to protect miners.",
        "headTitle": "Assistant Secretary of Labor for Mine Safety and Health",
        "headName": "Wayne D. Palmer",
        "acting": false,
        "headSource": "https://www.dol.gov/general/contact/contact-phonekeypersonnel",
        "website": "https://www.msha.gov/",
        "note": null
      },
      {
        "name": "Employment and Training Administration (ETA)",
        "does": "Funds job training and apprenticeships, oversees the state unemployment insurance system, and certifies employer requests for foreign workers.",
        "headTitle": "Assistant Secretary of Labor for Employment and Training",
        "headName": "Marek Laco",
        "acting": true,
        "headSource": "https://www.dol.gov/general/contact/contact-phonekeypersonnel",
        "website": "https://www.dol.gov/agencies/eta",
        "note": null
      },
      {
        "name": "Employee Benefits Security Administration (EBSA)",
        "does": "Protects workers’ retirement plans, such as 401(k)s and pensions, and health plans offered through private employers.",
        "headTitle": "Assistant Secretary of Labor for Employee Benefits Security",
        "headName": "Daniel Aronowitz",
        "acting": false,
        "headSource": "https://www.dol.gov/general/contact/contact-phonekeypersonnel",
        "website": "https://www.dol.gov/agencies/ebsa",
        "note": null
      },
      {
        "name": "Office of Workers’ Compensation Programs (OWCP)",
        "does": "Pays benefits to federal employees and certain other workers who are hurt or made sick by their jobs.",
        "headTitle": "Director",
        "headName": "Thomas Stohler",
        "acting": false,
        "headSource": "https://www.dol.gov/general/contact/contact-phonekeypersonnel",
        "website": "https://www.dol.gov/agencies/owcp",
        "note": null
      },
      {
        "name": "Veterans’ Employment and Training Service (VETS)",
        "does": "Helps veterans and service members find civilian jobs and protects their right to return to a job after military service.",
        "headTitle": "Assistant Secretary of Labor for Veterans’ Employment and Training",
        "headName": "Jeremiah Workman",
        "acting": false,
        "headSource": "https://www.dol.gov/general/contact/contact-phonekeypersonnel",
        "website": "https://www.dol.gov/agencies/vets",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "Labor, Health and Human Services, Education, and Related Agencies appropriations bill",
      "laws": [
        {
          "name": "Fair Labor Standards Act of 1938",
          "what": "Created the federal minimum wage, overtime pay and limits on child labor."
        },
        {
          "name": "Occupational Safety and Health Act of 1970",
          "what": "Requires employers to keep workplaces safe and created OSHA to enforce that."
        },
        {
          "name": "Employee Retirement Income Security Act of 1974 (ERISA)",
          "what": "Sets rules that protect the retirement and health plans workers get through private employers."
        }
      ],
      "confirmed": "The Secretary, the Deputy Secretary, the Solicitor, the Assistant Secretaries (including the heads of OSHA and MSHA), the Wage and Hour Administrator and the Commissioner of Labor Statistics must be confirmed by the Senate.",
      "source": "https://appropriations.house.gov/subcommittees/labor-health-and-human-services-education-and-related-agencies/jurisdiction"
    }
  },
  "hhs": {
    "components": [
      {
        "name": "Food and Drug Administration (FDA)",
        "does": "Checks that medicines, vaccines, medical devices and most foods are safe before and after they are sold.",
        "headTitle": "Commissioner of Food and Drugs",
        "headName": "Kyle Diamantas",
        "acting": true,
        "headSource": "https://www.fda.gov/about-fda/fda-organization/fda-leadership-profiles",
        "website": "https://www.fda.gov",
        "note": "Acting since May 2026, when Commissioner Marty Makary left."
      },
      {
        "name": "Centers for Disease Control and Prevention (CDC)",
        "does": "Tracks diseases and health threats and advises the public and doctors on how to prevent them.",
        "headTitle": "Director",
        "headName": "Erica Schwartz",
        "acting": false,
        "headSource": "https://www.cdc.gov/about/leadership/index.html",
        "website": "https://www.cdc.gov",
        "note": "Confirmed by the Senate in August 2026."
      },
      {
        "name": "National Institutes of Health (NIH)",
        "does": "Pays for and carries out medical research into diseases and treatments.",
        "headTitle": "Director",
        "headName": "Jay Bhattacharya",
        "acting": false,
        "headSource": "https://www.nih.gov/news-events/news-releases/nih-announces-record-number-grants-support-early-career-investigators-launches-new-recruitment-initiative-intramural-research",
        "website": "https://www.nih.gov",
        "note": null
      },
      {
        "name": "Centers for Medicare & Medicaid Services (CMS)",
        "does": "Runs Medicare, and works with states to run Medicaid, the Children’s Health Insurance Program and the HealthCare.gov insurance marketplace.",
        "headTitle": "Administrator",
        "headName": "Mehmet Oz",
        "acting": false,
        "headSource": "https://www.cms.gov/about-cms/who-we-are/leadership",
        "website": "https://www.cms.gov",
        "note": null
      },
      {
        "name": "Administration for Children and Families (ACF)",
        "does": "Funds programs for children and families such as Head Start, child care help, foster care and child support.",
        "headTitle": "Assistant Secretary",
        "headName": "Alex J. Adams",
        "acting": false,
        "headSource": "https://acf.gov/about/leadership",
        "website": "https://acf.gov",
        "note": null
      },
      {
        "name": "Substance Abuse and Mental Health Services Administration (SAMHSA)",
        "does": "Funds mental health and addiction treatment programs and oversees the 988 crisis line.",
        "headTitle": "Assistant Secretary for Mental Health and Substance Use",
        "headName": null,
        "acting": false,
        "headSource": "https://www.samhsa.gov/about/leadership",
        "website": "https://www.samhsa.gov",
        "note": "No Assistant Secretary is listed. The top official shown is Christopher D. Carroll, Principal Deputy Assistant Secretary."
      },
      {
        "name": "Health Resources and Services Administration (HRSA)",
        "does": "Funds community health centers and programs that bring doctors and nurses to places that have too few.",
        "headTitle": "Administrator",
        "headName": "Thomas J. Engels",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/09/30/2026-19937/notice-of-supplemental-award-maternal-health-research-collaborative-for-minority-serving",
        "website": "https://www.hrsa.gov",
        "note": null
      },
      {
        "name": "Indian Health Service (IHS)",
        "does": "Provides health care to American Indians and Alaska Natives.",
        "headTitle": "Director",
        "headName": "Mark Cruz",
        "acting": false,
        "headSource": "https://www.ihs.gov/aboutihs/keyleaders/",
        "website": "https://www.ihs.gov",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "Labor, Health and Human Services, Education, and Related Agencies appropriations bill (the FDA is funded through the Agriculture bill and the Indian Health Service through the Interior bill)",
      "laws": [
        {
          "name": "Social Security Amendments of 1965",
          "what": "Created Medicare for older Americans and Medicaid for people with low incomes."
        },
        {
          "name": "Public Health Service Act (1944)",
          "what": "Gives the department its powers over public health, disease control and medical research."
        },
        {
          "name": "Federal Food, Drug, and Cosmetic Act (1938)",
          "what": "Requires drugs and medical devices to be shown safe before sale and lets the FDA police food safety."
        }
      ],
      "confirmed": "The Senate must confirm the Secretary, the Deputy Secretary, the heads of the FDA, CDC, NIH, CMS and the Indian Health Service, the Surgeon General and the assistant secretaries.",
      "source": "https://appropriations.house.gov/subcommittees/labor-health-and-human-services-education-and-related-agencies/jurisdiction"
    }
  },
  "hud": {
    "components": [
      {
        "name": "Federal Housing Administration (FHA)",
        "does": "Insures home loans so that banks can lend to buyers who have small down payments or lower credit scores.",
        "headTitle": "Assistant Secretary for Housing and Federal Housing Commissioner",
        "headName": "Joseph M. Gormley",
        "acting": true,
        "headSource": "https://www.hud.gov/aboutus/leadership",
        "website": "https://www.hud.gov",
        "note": "Commissioner Frank Cassidy resigned in June 2026. Gormley is also President of Ginnie Mae."
      },
      {
        "name": "Office of Public and Indian Housing (PIH)",
        "does": "Funds local housing authorities, public housing and Housing Choice (Section 8) rent vouchers.",
        "headTitle": "Assistant Secretary",
        "headName": "Benjamin Hobbs",
        "acting": false,
        "headSource": "https://www.hud.gov/aboutus/leadership",
        "website": "https://www.hud.gov",
        "note": null
      },
      {
        "name": "Office of Community Planning and Development (CPD)",
        "does": "Gives cities and states grants for community projects, affordable housing and homeless services.",
        "headTitle": "Assistant Secretary",
        "headName": "Ronald Kurtz",
        "acting": false,
        "headSource": "https://www.hud.gov/aboutus/leadership",
        "website": "https://www.hud.gov",
        "note": null
      },
      {
        "name": "Office of Fair Housing and Equal Opportunity (FHEO)",
        "does": "Investigates complaints of discrimination in renting, selling and lending for housing.",
        "headTitle": "Assistant Secretary",
        "headName": "Craig Trainor",
        "acting": false,
        "headSource": "https://www.hud.gov/aboutus/leadership",
        "website": "https://www.hud.gov",
        "note": null
      },
      {
        "name": "Government National Mortgage Association (Ginnie Mae)",
        "does": "Guarantees bonds backed by government-insured home loans, which keeps mortgage money flowing to lenders.",
        "headTitle": "President",
        "headName": "Joseph M. Gormley",
        "acting": false,
        "headSource": "https://www.hud.gov/aboutus/leadership",
        "website": "https://www.ginniemae.gov",
        "note": null
      }
    ],
    "congress": {
      "fundedBy": "Transportation, Housing and Urban Development, and Related Agencies appropriations bill",
      "laws": [
        {
          "name": "Department of Housing and Urban Development Act (1965)",
          "what": "Created the department and made its Secretary a member of the Cabinet."
        },
        {
          "name": "National Housing Act (1934)",
          "what": "Created the Federal Housing Administration and its home loan insurance."
        },
        {
          "name": "Fair Housing Act (1968)",
          "what": "Bans discrimination in selling, renting and financing homes."
        }
      ],
      "confirmed": "The Senate must confirm the Secretary, the Deputy Secretary, the assistant secretaries, the President of Ginnie Mae and the Inspector General.",
      "source": "https://appropriations.house.gov/subcommittees/transportation-housing-and-urban-development-and-related-agencies/jurisdiction"
    }
  },
  "transportation": {
    "components": [
      {
        "name": "Federal Aviation Administration (FAA)",
        "does": "Runs air traffic control and sets safety rules for airlines, pilots, aircraft and airports.",
        "headTitle": "Administrator",
        "headName": "Bryan Bedford",
        "acting": false,
        "headSource": "https://www.faa.gov/about/key_officials",
        "website": "https://www.faa.gov",
        "note": null
      },
      {
        "name": "Federal Highway Administration (FHWA)",
        "does": "Sends federal money to states to build and repair highways and bridges and sets road standards.",
        "headTitle": "Administrator",
        "headName": "Sean McMaster",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/10/02/2026-20210/application-from-the-state-of-georgia-to-the-surface-transportation-project-delivery-program-and",
        "website": "https://highways.dot.gov",
        "note": null
      },
      {
        "name": "National Highway Traffic Safety Administration (NHTSA)",
        "does": "Sets safety standards for cars and trucks, orders recalls and runs crash tests.",
        "headTitle": "Administrator",
        "headName": "Jonathan Morrison",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/11/16/2026-23239/federal-motor-vehicle-safety-standards-modernization-of-fmvss-no-108-to-accommodate-ads-equipped",
        "website": "https://www.nhtsa.gov",
        "note": null
      },
      {
        "name": "Federal Motor Carrier Safety Administration (FMCSA)",
        "does": "Sets and enforces safety rules for commercial trucks, buses and their drivers.",
        "headTitle": "Administrator",
        "headName": "Derek D. Barrs",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/10/28/2026-21950/parts-and-accessories-necessary-for-safe-operation-application-for-exemption-renewal-from-loomis",
        "website": "https://www.fmcsa.dot.gov",
        "note": null
      },
      {
        "name": "Federal Railroad Administration (FRA)",
        "does": "Sets and enforces safety rules for railroads and funds passenger and freight rail projects.",
        "headTitle": "Administrator",
        "headName": "David A. Fink",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/08/31/2026-17792/permitting-use-of-computer-based-three-dimensional-simulation-for-periodic-refresher-training-on",
        "website": "https://railroads.dot.gov",
        "note": null
      },
      {
        "name": "Federal Transit Administration (FTA)",
        "does": "Gives grants to local bus, subway, light rail and ferry systems and oversees their safety.",
        "headTitle": "Administrator",
        "headName": null,
        "acting": false,
        "headSource": "https://www.whitehouse.gov/presidential-actions/2026/11/nominations-and-withdrawals-sent-to-the-senate-b6a4/",
        "website": "https://www.transit.dot.gov",
        "note": "Vacant since February 2026. A nomination went to the Senate in November 2026."
      },
      {
        "name": "Pipeline and Hazardous Materials Safety Administration (PHMSA)",
        "does": "Sets safety rules for oil and gas pipelines and for shipping dangerous materials.",
        "headTitle": "Administrator",
        "headName": "Paul Roberti",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/11/03/2026-22396/pipeline-safety-amendments-to-liquefied-natural-gas-facilities",
        "website": "https://www.phmsa.dot.gov",
        "note": null
      },
      {
        "name": "Maritime Administration (MARAD)",
        "does": "Supports American shipping, ports and shipbuilding and runs the U.S. Merchant Marine Academy.",
        "headTitle": "Administrator",
        "headName": "Stephen Carmel",
        "acting": false,
        "headSource": "https://transportation.house.gov/uploadedfiles/06-03-2026_cgmt_hearing_-_administrator_carmel_-_testimony.pdf",
        "website": "https://www.maritime.dot.gov",
        "note": "Last official confirmation found: June 2026."
      }
    ],
    "congress": {
      "fundedBy": "Transportation, Housing and Urban Development, and Related Agencies appropriations bill",
      "laws": [
        {
          "name": "Department of Transportation Act (1966)",
          "what": "Created the department by bringing federal highway, aviation, rail and other transportation agencies under one Secretary."
        },
        {
          "name": "Infrastructure Investment and Jobs Act (2021)",
          "what": "Set five years of funding for highways, bridges, transit and rail, the kind of multi-year law Congress passes to steer most of the department’s grant money."
        },
        {
          "name": "FAA Reauthorization Act of 2024",
          "what": "Renewed the FAA’s authority and set aviation safety and air traffic control priorities."
        }
      ],
      "confirmed": "The Senate must confirm the Secretary, the Deputy Secretary and the administrators of the FAA, FHWA, NHTSA, FMCSA, FRA, FTA, PHMSA and MARAD.",
      "source": "https://appropriations.house.gov/subcommittees/transportation-housing-and-urban-development-and-related-agencies/jurisdiction"
    }
  },
  "energy": {
    "components": [
      {
        "name": "National Nuclear Security Administration (NNSA)",
        "does": "Builds and maintains the country’s nuclear weapons and supplies the reactors that power Navy submarines and aircraft carriers.",
        "headTitle": "Administrator and Under Secretary for Nuclear Security",
        "headName": "Brandon Williams",
        "acting": false,
        "headSource": "https://www.energy.gov/nnsa/person/brandon-williams",
        "website": "https://www.energy.gov/nnsa",
        "note": null
      },
      {
        "name": "Office of Science",
        "does": "Funds basic research in physics, chemistry, computing and energy and oversees 10 of the national laboratories.",
        "headTitle": "Director",
        "headName": null,
        "acting": false,
        "headSource": "https://www.energy.gov/science/leadership",
        "website": "https://www.energy.gov/science",
        "note": "The office lists the Director as vacant (page dated April 2026). The senior career official is Harriet Kung, Deputy Director for Science Programs."
      },
      {
        "name": "Energy Information Administration (EIA)",
        "does": "Collects and publishes independent data on energy prices, production and use.",
        "headTitle": "Administrator",
        "headName": "Tristan Abbey",
        "acting": false,
        "headSource": "https://www.eia.gov/about/senior_executive_bios.php",
        "website": "https://www.eia.gov",
        "note": null
      },
      {
        "name": "Office of Environmental Management (EM)",
        "does": "Cleans up radioactive and chemical waste left at sites where nuclear weapons were made.",
        "headTitle": "Assistant Secretary",
        "headName": "Timothy J. Walsh",
        "acting": false,
        "headSource": "https://www.energy.gov/em/leadership",
        "website": "https://www.energy.gov/em",
        "note": null
      },
      {
        "name": "Office of Nuclear Energy (NE)",
        "does": "Supports research on nuclear power plants, new reactor designs and nuclear fuel.",
        "headTitle": "Assistant Secretary",
        "headName": "Theodore J. Garrish",
        "acting": false,
        "headSource": "https://www.energy.gov/ne/person/theodore-j-garrish",
        "website": "https://www.energy.gov/ne",
        "note": null
      },
      {
        "name": "Bonneville Power Administration (BPA)",
        "does": "Sells electricity from federal dams in the Pacific Northwest to local utilities and runs much of the region’s power grid.",
        "headTitle": "Administrator and Chief Executive Officer",
        "headName": "Travis Kavulla",
        "acting": false,
        "headSource": "https://www.energy.gov/person/travis-kavulla",
        "website": "https://www.bpa.gov",
        "note": "The largest of the four federal power marketing administrations in the department."
      },
      {
        "name": "Office of Energy Dominance Financing (EDF)",
        "does": "Makes large federal loans and loan guarantees for energy projects.",
        "headTitle": "Director",
        "headName": "Gregory A. Beard",
        "acting": false,
        "headSource": "https://www.energy.gov/edf/leadership",
        "website": "https://www.energy.gov/edf",
        "note": "Formerly the Loan Programs Office."
      },
      {
        "name": "Federal Energy Regulatory Commission (FERC)",
        "does": "Regulates interstate power lines, natural gas pipelines and wholesale electricity prices.",
        "headTitle": "Chairman",
        "headName": "Laura V. Swett",
        "acting": false,
        "headSource": "https://www.ferc.gov/about/commission-members/chairman-laura-v-swett",
        "website": "https://www.ferc.gov",
        "note": "An independent commission housed in the department. The Secretary does not direct its decisions."
      }
    ],
    "congress": {
      "fundedBy": "Energy and Water Development and Related Agencies appropriations bill",
      "laws": [
        {
          "name": "Department of Energy Organization Act (1977)",
          "what": "Created the department by combining federal energy programs and nuclear weapons work."
        },
        {
          "name": "Atomic Energy Act of 1954",
          "what": "Sets the rules for nuclear materials, nuclear weapons and civilian nuclear power."
        },
        {
          "name": "National Nuclear Security Administration Act (1999)",
          "what": "Set up the NNSA as a separately run agency inside the department to manage nuclear weapons."
        }
      ],
      "confirmed": "The Senate must confirm the Secretary, the Deputy Secretary, the under secretaries (including the NNSA Administrator), the assistant secretaries, the Director of the Office of Science, the EIA Administrator and the FERC commissioners.",
      "source": "https://appropriations.house.gov/subcommittees/energy-and-water-development-and-related-agencies-0/jurisdiction"
    }
  },
  "education": {
    "components": [
      {
        "name": "Federal Student Aid (FSA)",
        "does": "Runs the FAFSA form, Pell Grants and the federal student loan program.",
        "headTitle": "Chief Operating Officer",
        "headName": null,
        "acting": false,
        "headSource": "https://fsapartners.ed.gov/training/federal-student-aid-fsa-training-conference/program/presenters/richard-j-lucas",
        "website": "https://studentaid.gov",
        "note": "Official sources disagree on who currently holds this job."
      },
      {
        "name": "Office for Civil Rights (OCR)",
        "does": "Investigates complaints that schools or colleges that get federal money discriminated against students.",
        "headTitle": "Assistant Secretary",
        "headName": "Kimberly Richey",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/10/23/2026-21685/clarification-on-department-of-justice-and-department-of-education-guidance-documents-",
        "website": "https://www.ed.gov",
        "note": "In June 2026 the department announced that civil rights enforcement would move to the Department of Justice."
      },
      {
        "name": "Office of Elementary and Secondary Education (OESE)",
        "does": "Sends federal money to K-12 schools, including Title I funds for schools with many low-income students.",
        "headTitle": "Assistant Secretary",
        "headName": "Kirsten Baesler",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/09/21/2026-19240/notice-announcing-impact-aid-discretionary-construction-grant-program-competition",
        "website": "https://www.ed.gov",
        "note": "Many K-12 programs are now managed day to day with the Department of Labor under agreements signed since 2025."
      },
      {
        "name": "Office of Special Education and Rehabilitative Services (OSERS)",
        "does": "Oversees federal funding and rules for educating students with disabilities.",
        "headTitle": "Assistant Secretary",
        "headName": null,
        "acting": false,
        "headSource": "https://www.kpbs.org/news/education/2026/09/09/special-education-head-at-education-department-abruptly-resigns",
        "website": "https://www.ed.gov",
        "note": "The acting head resigned in September 2026 and no successor is confirmed on an official page."
      },
      {
        "name": "Office of Postsecondary Education (OPE)",
        "does": "Writes rules for colleges that take federal student aid and funds programs for colleges and their students.",
        "headTitle": "Assistant Secretary",
        "headName": "David Barker",
        "acting": false,
        "headSource": "https://www.federalregister.gov/documents/2026/11/05/2026-22644/accrediting-agencies-currently-undergoing-review-for-the-purpose-of-recognition-by-the-us-secretary",
        "website": "https://www.ed.gov",
        "note": null
      },
      {
        "name": "Institute of Education Sciences (IES)",
        "does": "Collects national education statistics, runs the Nation’s Report Card and funds education research.",
        "headTitle": "Director",
        "headName": "Matthew Soldner",
        "acting": true,
        "headSource": "https://www.federalregister.gov/documents/2026/11/13/2026-23155/request-for-information",
        "website": "https://ies.ed.gov",
        "note": "Acting since April 2024. In October 2026 the Government Accountability Office found the acting title had outlasted the legal time limit."
      }
    ],
    "congress": {
      "fundedBy": "Labor, Health and Human Services, Education, and Related Agencies appropriations bill",
      "laws": [
        {
          "name": "Department of Education Organization Act (1979)",
          "what": "Created the department, which means only Congress can close it."
        },
        {
          "name": "Elementary and Secondary Education Act (1965)",
          "what": "Sends federal money to K-12 schools, especially those with many low-income students; its current version is the Every Student Succeeds Act of 2015."
        },
        {
          "name": "Higher Education Act (1965)",
          "what": "Created federal student grants and loans and sets the rules colleges must follow to take part."
        }
      ],
      "confirmed": "The Senate must confirm the Secretary, the Deputy Secretary, the Under Secretary, the assistant secretaries and the Director of the Institute of Education Sciences; the head of Federal Student Aid is chosen by the Secretary.",
      "source": "https://appropriations.house.gov/subcommittees/labor-health-and-human-services-education-and-related-agencies/jurisdiction"
    }
  },
  "va": {
    "components": [
      {
        "name": "Veterans Health Administration (VHA)",
        "does": "Runs VA hospitals and clinics and pays for veterans’ health care.",
        "headTitle": "Under Secretary for Health",
        "headName": "John Figueroa",
        "acting": true,
        "headSource": "https://department.va.gov/staff-biographies/john-figueroa/",
        "website": "https://www.va.gov/health/",
        "note": "Acting since July 2026, after Under Secretary John Bartrum resigned."
      },
      {
        "name": "Veterans Benefits Administration (VBA)",
        "does": "Handles disability pay, pensions, GI Bill education benefits and VA home loans.",
        "headTitle": "Under Secretary for Benefits",
        "headName": "Margarita Devlin",
        "acting": true,
        "headSource": "https://www.benefits.va.gov/benefits/about.asp",
        "website": "https://www.benefits.va.gov",
        "note": "There is no Senate-confirmed Under Secretary. Last official page: March 2026."
      },
      {
        "name": "National Cemetery Administration (NCA)",
        "does": "Runs national veterans cemeteries and provides headstones and burial benefits.",
        "headTitle": "Under Secretary for Memorial Affairs",
        "headName": "Samuel Brown",
        "acting": false,
        "headSource": "https://department.va.gov/biographies/",
        "website": "https://www.cem.va.gov",
        "note": "Last official page: May 2026."
      },
      {
        "name": "Board of Veterans’ Appeals (BVA)",
        "does": "Decides appeals from veterans who disagree with a VA benefits decision.",
        "headTitle": "Chairman",
        "headName": null,
        "acting": false,
        "headSource": "https://www.veterans.senate.gov/2026/6/hearing-to-consider-a-pending-nomination",
        "website": "https://www.bva.va.gov",
        "note": "A nominee had a Senate hearing in September 2026. No confirmation was found."
      }
    ],
    "congress": {
      "fundedBy": "Military Construction, Veterans Affairs, and Related Agencies appropriations bill",
      "laws": [
        {
          "name": "Department of Veterans Affairs Act (1988)",
          "what": "Turned the Veterans Administration into a Cabinet department starting in 1989."
        },
        {
          "name": "VA MISSION Act (2018)",
          "what": "Lets veterans get care from private doctors paid for by VA in certain cases."
        },
        {
          "name": "PACT Act (2022)",
          "what": "Expanded health care and benefits for veterans exposed to burn pits and other toxic substances."
        }
      ],
      "confirmed": "The Senate must confirm the Secretary, the Deputy Secretary, the three under secretaries (health, benefits and memorial affairs), the assistant secretaries, the General Counsel, the Inspector General and the Chairman of the Board of Veterans’ Appeals.",
      "source": "https://appropriations.house.gov/subcommittees/military-construction-veterans-affairs-and-related-agencies/jurisdiction"
    }
  },
  "dhs": {
    "components": [
      {
        "name": "U.S. Customs and Border Protection (CBP)",
        "does": "Guards the borders and checks people and goods entering the country at ports, airports and land crossings.",
        "headTitle": "Commissioner",
        "headName": "Rodney Scott",
        "acting": false,
        "headSource": "https://www.dhs.gov/leadership",
        "website": "https://www.cbp.gov",
        "note": null
      },
      {
        "name": "U.S. Immigration and Customs Enforcement (ICE)",
        "does": "Arrests, detains and deports people who are in the country illegally and investigates cross-border crime.",
        "headTitle": "Director",
        "headName": "David J. Venturella",
        "acting": true,
        "headSource": "https://www.ice.gov/leadership",
        "website": "https://www.ice.gov",
        "note": "The Director post is vacant. He is listed as the senior official performing the duties."
      },
      {
        "name": "Transportation Security Administration (TSA)",
        "does": "Screens passengers and bags at airports.",
        "headTitle": "Administrator",
        "headName": "David Cummins",
        "acting": false,
        "headSource": "https://www.dhs.gov/leadership",
        "website": "https://www.tsa.gov",
        "note": null
      },
      {
        "name": "Federal Emergency Management Agency (FEMA)",
        "does": "Helps states and people prepare for and recover from disasters such as hurricanes, floods and wildfires.",
        "headTitle": "Administrator",
        "headName": "Cameron D. Hamilton",
        "acting": false,
        "headSource": "https://www.dhs.gov/leadership",
        "website": "https://www.fema.gov",
        "note": null
      },
      {
        "name": "U.S. Coast Guard (USCG)",
        "does": "Rescues people at sea, patrols coasts and waterways and enforces maritime law.",
        "headTitle": "Commandant",
        "headName": "Admiral Kevin E. Lunday",
        "acting": false,
        "headSource": "https://www.dhs.gov/leadership",
        "website": "https://www.uscg.mil",
        "note": "A military service: its members are in uniform and are not counted as civilian employees."
      },
      {
        "name": "U.S. Secret Service (USSS)",
        "does": "Protects the President, Vice President and other leaders and investigates financial crimes such as counterfeiting.",
        "headTitle": "Director",
        "headName": "Sean M. Curran",
        "acting": false,
        "headSource": "https://www.secretservice.gov/about/leadership",
        "website": "https://www.secretservice.gov",
        "note": null
      },
      {
        "name": "U.S. Citizenship and Immigration Services (USCIS)",
        "does": "Processes applications for green cards, citizenship, work permits and asylum.",
        "headTitle": "Director",
        "headName": "Joseph B. Edlow",
        "acting": false,
        "headSource": "https://www.uscis.gov/about-us/organization/leadership",
        "website": "https://www.uscis.gov",
        "note": null
      },
      {
        "name": "Cybersecurity and Infrastructure Security Agency (CISA)",
        "does": "Helps protect government computer networks and key systems such as power grids and election equipment from attacks.",
        "headTitle": "Director",
        "headName": "Nicholas Andersen",
        "acting": true,
        "headSource": "https://www.cisa.gov/about/leadership",
        "website": "https://www.cisa.gov",
        "note": "CISA has had no Senate-confirmed director since January 2025."
      }
    ],
    "congress": {
      "fundedBy": "Homeland Security appropriations bill",
      "laws": [
        {
          "name": "Homeland Security Act of 2002",
          "what": "Created the department after the September 11 attacks by merging 22 federal agencies."
        },
        {
          "name": "Immigration and Nationality Act (1952)",
          "what": "The main immigration law, which sets who may enter, stay, become a citizen or be removed."
        },
        {
          "name": "Stafford Act (1988)",
          "what": "Lets the President declare disasters and sets the rules for FEMA aid to states and people."
        }
      ],
      "confirmed": "The Senate must confirm the Secretary, the Deputy Secretary, the under secretaries, the heads of CBP, ICE, USCIS, TSA, FEMA and CISA, and the Coast Guard Commandant.",
      "source": "https://appropriations.house.gov/subcommittees/homeland-security-0/jurisdiction"
    }
  }
}

// Facts about the civilian federal workforce, each with its source.
export const WORKFORCE_FACTS = [
  {
    "fact": "OPM counts 2,017,021 civilian federal employees currently serving.",
    "source": "https://data.opm.gov/explore-data/analytics/workforce-size-and-composition",
    "asOf": "September 2026"
  },
  {
    "fact": "The Department of Defense employs 33.2% of civilian federal employees, and the next largest employers are Veterans Affairs, Homeland Security, Justice and the Treasury.",
    "source": "https://data.opm.gov/explore-data/analytics/workforce-size-and-composition",
    "asOf": "September 2026"
  },
  {
    "fact": "About 86.6 percent of federal employees work outside the Washington, DC area.",
    "source": "https://www.govexec.com/workforce/2026/02/tail-wagging-dog-snapshots-public-service-year-second-trump-administration/411224",
    "asOf": "February 2026, Government Executive citing OPM data"
  },
  {
    "fact": "A president can fill roughly 4,000 political appointee positions, and more than 1,300 of them need Senate confirmation; everyone else is career staff.",
    "source": "https://presidentialtransition.org/faqs-the-partnership-and-washington-post-trump-appointee-tracker/",
    "asOf": "January 2025"
  },
  {
    "fact": "The Senior Executive Service, the top managers who work just below presidential appointees, had 6,651 members: 5,805 career, 801 noncareer (political) and 45 on limited appointments.",
    "source": "https://www.everycrsreport.com/files/2026-07-21_IF11743_68c6c77cb776afbf232f00d953f81b19047809b7.html",
    "asOf": "May 2026"
  },
  {
    "fact": "Uniformed military personnel are counted separately from civilian workers; Congress authorized 1,302,800 active-duty troops for fiscal year 2026.",
    "source": "https://www.everycrsreport.com/reports/IN12651.html",
    "asOf": "Fiscal year 2026"
  },
  {
    "fact": "The U.S. Postal Service has more than 630,000 employees, and they are not included in OPM’s civilian workforce count.",
    "source": "https://about.usps.com/who/profile/",
    "asOf": "USPS, read November 2026"
  },
  {
    "fact": "Nurses are the largest single occupation in the federal government, with 106,725 serving, mostly at the Department of Veterans Affairs.",
    "source": "https://data.opm.gov/explore-data/analytics/workforce-size-and-composition",
    "asOf": "September 2026"
  }
]
