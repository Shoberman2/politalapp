/**
 * 119th Congress (2025-2027) Senate desks: all 100, from the Senate's own data.
 *
 * GENERATED from the floor plans behind the Senate's interactive seating map:
 *   https://www.senate.gov/art-artifacts/decorative-art/furniture/senate-chamber-desks/chambermap.htm
 *   data: .../senate-chamber-desks/xml/classes.xml (index) and
 *         .../xml/floorplans/119_{1a,1b,1c,1d,2,2b,2c}_red.xml (seven plans,
 *         2025-01-03 through "2026, Jul 14-present")
 * Retrieved 2026-11-14. Do not edit rows by hand: re-read the floor plans.
 *
 * What each part is:
 *   - desks:       where every desk stands in the current plan. deskId is the
 *                  Senate's own desk number (1-100). arc is the row (1 = front),
 *                  position counts left to right across the whole row as seen
 *                  from the rostrum's side of the map, side is the half of the
 *                  Chamber ('D' = left of the centre aisle, 'R' = right).
 *                  Independents sit on the left. No desk changed row or side
 *                  between the seven plans.
 *   - assignments: one row per (desk, occupant) span. assignedAt is the first
 *                  day of the first plan that shows that senator at that desk;
 *                  vacatedAt is the first day of the plan that shows someone
 *                  else. bioguideId comes from the plan's own link. null means
 *                  the plan shows the desk without a senator.
 *   - lineageRows: only spans whose start year the plans themselves show.
 *                  Earlier occupants are named, in the Senate's order, in the
 *                  desk description (the Senate's desk pages list them without
 *                  dates).
 *
 * Two senator ids are corrected here. The plans link Jon Ossoff's desk (32)
 * to P000612, which is David Perdue, and John Hickenlooper's desk to O000174,
 * which is Jon Ossoff. The names and states in the plans are right, so the
 * rows carry O000174 for Ossoff and H000273 for Hickenlooper. Every other id
 * was checked against the member's name and state in our own records.
 *
 * The earlier stub put the famous desks at 64, 80 and 91 and gave them
 * occupant histories that do not match the Senate's pages. The real numbers
 * are 29 (Webster), 60 (Davis) and 49 (the candy desk since 2025);
 * retiredFamousDeskIds makes the loader clear the old rows.
 */

import type { DeskDataForCongress } from './index.js';

const SOURCE = 'senate_gov_floor_plan';

export const deskData119th: DeskDataForCongress = {
  congress: 119,
  source: SOURCE,
  notes:
    'All 100 desks from the Senate floor plans for the 119th Congress (seven plans, 2025-01-03 to present).',
  retiredFamousDeskIds: [64, 80, 91],
  desks: [
    { deskId: 63, side: 'D', arc: 1, position: 1 },
    { deskId: 19, side: 'D', arc: 1, position: 2 },
    { deskId: 56, side: 'D', arc: 1, position: 3 },
    { deskId: 33, side: 'D', arc: 1, position: 4 },
    { deskId: 87, side: 'D', arc: 1, position: 5 },
    { deskId: 11, side: 'D', arc: 1, position: 6 },
    { deskId: 64, side: 'D', arc: 1, position: 7 },
    { deskId: 10, side: 'D', arc: 1, position: 8 },
    { deskId: 9, side: 'R', arc: 1, position: 9 },
    { deskId: 28, side: 'R', arc: 1, position: 10 },
    { deskId: 86, side: 'R', arc: 1, position: 11 },
    { deskId: 58, side: 'R', arc: 1, position: 12 },
    { deskId: 92, side: 'R', arc: 1, position: 13 },
    { deskId: 53, side: 'R', arc: 1, position: 14 },
    { deskId: 30, side: 'R', arc: 1, position: 15 },
    { deskId: 65, side: 'R', arc: 1, position: 16 },
    { deskId: 12, side: 'D', arc: 2, position: 1 },
    { deskId: 13, side: 'D', arc: 2, position: 2 },
    { deskId: 57, side: 'D', arc: 2, position: 3 },
    { deskId: 96, side: 'D', arc: 2, position: 4 },
    { deskId: 14, side: 'D', arc: 2, position: 5 },
    { deskId: 97, side: 'D', arc: 2, position: 6 },
    { deskId: 83, side: 'D', arc: 2, position: 7 },
    { deskId: 43, side: 'D', arc: 2, position: 8 },
    { deskId: 44, side: 'D', arc: 2, position: 9 },
    { deskId: 84, side: 'D', arc: 2, position: 10 },
    { deskId: 20, side: 'D', arc: 2, position: 11 },
    { deskId: 27, side: 'R', arc: 2, position: 12 },
    { deskId: 60, side: 'R', arc: 2, position: 13, famousName: 'Jefferson Davis Desk', description: 'Known as the Jefferson Davis Desk. Since 1995 it has been assigned to the senior senator from Mississippi. Occupants on record, in order: Jefferson Davis, John S. Williams, Byron P. Harrison, Harry S. Truman, Millard E. Tydings, John C. Stennis, Thad Cochran, Roger F. Wicker.' },
    { deskId: 38, side: 'R', arc: 2, position: 14 },
    { deskId: 41, side: 'R', arc: 2, position: 15 },
    { deskId: 70, side: 'R', arc: 2, position: 16 },
    { deskId: 79, side: 'R', arc: 2, position: 17 },
    { deskId: 6, side: 'R', arc: 2, position: 18 },
    { deskId: 59, side: 'R', arc: 2, position: 19 },
    { deskId: 34, side: 'R', arc: 2, position: 20 },
    { deskId: 61, side: 'R', arc: 2, position: 21 },
    { deskId: 37, side: 'R', arc: 2, position: 22 },
    { deskId: 8, side: 'R', arc: 2, position: 23 },
    { deskId: 93, side: 'D', arc: 3, position: 1 },
    { deskId: 21, side: 'D', arc: 3, position: 2 },
    { deskId: 36, side: 'D', arc: 3, position: 3 },
    { deskId: 32, side: 'D', arc: 3, position: 4 },
    { deskId: 71, side: 'D', arc: 3, position: 5 },
    { deskId: 67, side: 'D', arc: 3, position: 6 },
    { deskId: 35, side: 'D', arc: 3, position: 7 },
    { deskId: 68, side: 'D', arc: 3, position: 8 },
    { deskId: 88, side: 'D', arc: 3, position: 9 },
    { deskId: 91, side: 'D', arc: 3, position: 10 },
    { deskId: 31, side: 'D', arc: 3, position: 11 },
    { deskId: 29, side: 'D', arc: 3, position: 12, famousName: 'Daniel Webster Desk', description: 'Known as the Daniel Webster Desk. Since 1974 it has been assigned to the senior senator from New Hampshire. Occupants on record, in order: Daniel Webster, Charles Sumner, George F. Hoar, Eugene Hale, Henry Cabot Lodge Sr., George P. McLean, James E. Watson, Frederick Hale, Arthur H. Vandenberg, Wallace H. White Jr., Styles Bridges, Norris H. Cotton, Thomas J. McIntyre, John A. Durkin, Mack F. Mattingly, Gordon J. Humphrey, Warren B. Rudman, Robert C. Smith, Judd Gregg, Jeanne Shaheen.' },
    { deskId: 39, side: 'D', arc: 3, position: 13 },
    { deskId: 100, side: 'R', arc: 3, position: 14 },
    { deskId: 23, side: 'R', arc: 3, position: 15 },
    { deskId: 45, side: 'R', arc: 3, position: 16 },
    { deskId: 50, side: 'R', arc: 3, position: 17 },
    { deskId: 74, side: 'R', arc: 3, position: 18 },
    { deskId: 81, side: 'R', arc: 3, position: 19 },
    { deskId: 1, side: 'R', arc: 3, position: 20 },
    { deskId: 48, side: 'R', arc: 3, position: 21 },
    { deskId: 52, side: 'R', arc: 3, position: 22 },
    { deskId: 55, side: 'R', arc: 3, position: 23 },
    { deskId: 47, side: 'R', arc: 3, position: 24 },
    { deskId: 2, side: 'R', arc: 3, position: 25 },
    { deskId: 40, side: 'R', arc: 3, position: 26 },
    { deskId: 85, side: 'R', arc: 3, position: 27 },
    { deskId: 25, side: 'R', arc: 3, position: 28 },
    { deskId: 80, side: 'D', arc: 4, position: 1 },
    { deskId: 99, side: 'D', arc: 4, position: 2 },
    { deskId: 94, side: 'D', arc: 4, position: 3 },
    { deskId: 3, side: 'D', arc: 4, position: 4 },
    { deskId: 75, side: 'D', arc: 4, position: 5 },
    { deskId: 15, side: 'D', arc: 4, position: 6 },
    { deskId: 16, side: 'D', arc: 4, position: 7 },
    { deskId: 24, side: 'D', arc: 4, position: 8 },
    { deskId: 69, side: 'D', arc: 4, position: 9 },
    { deskId: 46, side: 'D', arc: 4, position: 10 },
    { deskId: 90, side: 'D', arc: 4, position: 11 },
    { deskId: 18, side: 'D', arc: 4, position: 12 },
    { deskId: 62, side: 'D', arc: 4, position: 13 },
    { deskId: 5, side: 'D', arc: 4, position: 14 },
    { deskId: 66, side: 'D', arc: 4, position: 15 },
    { deskId: 77, side: 'R', arc: 4, position: 16 },
    { deskId: 72, side: 'R', arc: 4, position: 17 },
    { deskId: 22, side: 'R', arc: 4, position: 18 },
    { deskId: 98, side: 'R', arc: 4, position: 19 },
    { deskId: 76, side: 'R', arc: 4, position: 20 },
    { deskId: 54, side: 'R', arc: 4, position: 21 },
    { deskId: 17, side: 'R', arc: 4, position: 22 },
    { deskId: 7, side: 'R', arc: 4, position: 23 },
    { deskId: 26, side: 'R', arc: 4, position: 24 },
    { deskId: 42, side: 'R', arc: 4, position: 25 },
    { deskId: 89, side: 'R', arc: 4, position: 26 },
    { deskId: 4, side: 'R', arc: 4, position: 27 },
    { deskId: 49, side: 'R', arc: 4, position: 28, famousName: 'Candy Desk', description: 'The candy desk since 2025. The custom began in 1965, when Senator George Murphy of California kept candy in his desk drawer. The role belongs to a place, not a piece of furniture: each Congress it is the desk in the last row on the Republican side, on the aisle, next to the Chamber\'s busiest entrance.' },
    { deskId: 78, side: 'R', arc: 4, position: 29 },
    { deskId: 82, side: 'R', arc: 4, position: 30 },
    { deskId: 73, side: 'R', arc: 4, position: 31 },
    { deskId: 95, side: 'R', arc: 4, position: 32 },
    { deskId: 51, side: 'R', arc: 4, position: 33 },
  ],
  assignments: [
    { deskId: 1, bioguideId: 'C001047', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Capito, Shelley Moore (R-WV)
    { deskId: 2, bioguideId: 'S001227', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Schmitt, Eric (R-MO)
    { deskId: 3, bioguideId: 'B001288', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Booker, Cory A. (D-NJ)
    { deskId: 4, bioguideId: 'C001096', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Cramer, Kevin (R-ND)
    { deskId: 5, bioguideId: 'V000128', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Van Hollen, Chris (D-MD)
    { deskId: 6, bioguideId: 'R000605', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Rounds, Mike (R-SD)
    { deskId: 7, bioguideId: 'L000571', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Lummis, Cynthia M. (R-WY)
    { deskId: 8, bioguideId: 'H001079', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Hyde-Smith, Cindy (R-MS)
    { deskId: 9, bioguideId: 'T000250', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Thune, John (R-SD)
    { deskId: 10, bioguideId: 'S000148', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Schumer, Charles E. (D-NY)
    { deskId: 11, bioguideId: 'K000367', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Klobuchar, Amy (D-MN)
    { deskId: 12, bioguideId: 'S001203', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Smith, Tina (D-MN)
    { deskId: 13, bioguideId: 'H001076', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Hassan, Margaret Wood (D-NH)
    { deskId: 14, bioguideId: 'P000595', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Peters, Gary C. (D-MI)
    { deskId: 15, bioguideId: 'W000802', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Whitehouse, Sheldon (D-RI)
    { deskId: 16, bioguideId: 'B001230', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Baldwin, Tammy (D-WI)
    { deskId: 17, bioguideId: 'T000476', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Tillis, Thom (R-NC)
    { deskId: 18, bioguideId: 'W000805', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Warner, Mark R. (D-VA)
    { deskId: 19, bioguideId: 'K000394', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Kim, Andy (D-NJ)
    { deskId: 20, bioguideId: 'M001111', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Murray, Patty (D-WA)
    { deskId: 21, bioguideId: 'S001208', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Slotkin, Elissa (D-MI)
    { deskId: 22, bioguideId: 'Y000064', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Young, Todd (R-IN)
    { deskId: 23, bioguideId: 'B001236', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Boozman, John (R-AR)
    { deskId: 24, bioguideId: 'D000622', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Duckworth, Tammy (D-IL)
    { deskId: 25, bioguideId: 'B001299', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Banks, Jim (R-IN)
    { deskId: 26, bioguideId: 'C001075', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Cassidy, Bill (R-LA)
    { deskId: 27, bioguideId: 'C001035', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Collins, Susan M. (R-ME)
    { deskId: 28, bioguideId: 'B001261', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Barrasso, John (R-WY)
    { deskId: 29, bioguideId: 'S001181', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Shaheen, Jeanne (D-NH)
    { deskId: 30, bioguideId: 'H000601', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Hagerty, Bill (R-TN)
    { deskId: 31, bioguideId: 'M001176', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Merkley, Jeff (D-OR)
    { deskId: 32, bioguideId: 'O000174', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Ossoff, Jon (D-GA)
    { deskId: 33, bioguideId: 'S001194', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Schatz, Brian (D-HI)
    { deskId: 34, bioguideId: 'K000393', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Kennedy, John (R-LA)
    { deskId: 35, bioguideId: 'W000790', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Warnock, Raphael G. (D-GA)
    { deskId: 36, bioguideId: 'A000382', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Alsobrooks, Angela D. (D-MD)
    { deskId: 37, bioguideId: 'C001114', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Curtis, John R. (R-UT)
    { deskId: 38, bioguideId: 'M001153', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Murkowski, Lisa (R-AK)
    { deskId: 39, bioguideId: 'C000127', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Cantwell, Maria (D-WA)
    { deskId: 40, bioguideId: 'B001319', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Britt, Katie Boyd (R-AL)
    { deskId: 41, bioguideId: 'C001056', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Cornyn, John (R-TX)
    { deskId: 42, bioguideId: 'L000577', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Lee, Mike (R-UT)
    { deskId: 43, bioguideId: 'S000033', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Sanders, Bernard (I-VT)
    { deskId: 44, bioguideId: 'W000779', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Wyden, Ron (D-OR)
    { deskId: 45, bioguideId: 'H001061', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Hoeven, John (R-ND)
    { deskId: 46, bioguideId: 'M000133', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Markey, Edward J. (D-MA)
    { deskId: 47, bioguideId: 'B001305', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Budd, Ted (R-NC)
    { deskId: 48, bioguideId: 'C001095', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Cotton, Tom (R-AR)
    { deskId: 49, bioguideId: 'M001190', assignedAt: '2025-01-03', vacatedAt: '2026-03-24', reason: 'newly_seated', confidence: 'high' }, // Mullin, Markwayne (R-OK)
    { deskId: 49, bioguideId: 'A000383', assignedAt: '2026-03-24', reason: 'reassigned', confidence: 'high' }, // Armstrong, Alan (R-OK)
    { deskId: 50, bioguideId: 'R000584', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Risch, James E. (R-ID)
    { deskId: 51, bioguideId: 'M001242', assignedAt: '2025-01-03', vacatedAt: '2025-01-27', reason: 'newly_seated', confidence: 'high' }, // Moreno, Bernie (R-OH)
    { deskId: 51, bioguideId: 'H001104', assignedAt: '2025-01-27', reason: 'reassigned', confidence: 'high' }, // Husted, Jon (R-OH)
    { deskId: 52, bioguideId: 'D000618', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Daines, Steve (R-MT)
    { deskId: 53, bioguideId: 'S001217', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Scott, Rick (R-FL)
    { deskId: 54, bioguideId: 'S001184', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Scott, Tim (R-SC)
    { deskId: 55, bioguideId: 'L000575', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Lankford, James (R-OK)
    { deskId: 56, bioguideId: 'M001169', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Murphy, Christopher (D-CT)
    { deskId: 57, bioguideId: 'K000383', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // King, Angus S., Jr. (I-ME)
    { deskId: 58, bioguideId: 'M000355', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // McConnell, Mitch (R-KY)
    { deskId: 59, bioguideId: 'G000359', assignedAt: '2025-01-03', vacatedAt: '2026-07-14', reason: 'newly_seated', confidence: 'high' }, // Graham, Lindsey (R-SC)
    { deskId: 59, bioguideId: 'G000608', assignedAt: '2026-07-14', reason: 'reassigned', confidence: 'high' }, // Graham, Darline (R-SC)
    { deskId: 60, bioguideId: 'W000437', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Wicker, Roger F. (R-MS)
    { deskId: 61, bioguideId: 'M001198', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Marshall, Roger, M.D. (R-KS)
    { deskId: 62, bioguideId: 'C001113', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Cortez Masto, Catherine (D-NV)
    { deskId: 63, bioguideId: 'G000574', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Gallego, Ruben (D-AZ)
    { deskId: 64, bioguideId: 'D000563', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Durbin, Richard J. (D-IL)
    { deskId: 65, bioguideId: null, assignedAt: '2025-01-03', vacatedAt: '2025-01-14', reason: 'vacancy', confidence: 'high' }, // no senator shown
    { deskId: 65, bioguideId: 'J000312', assignedAt: '2025-01-14', reason: 'reassigned', confidence: 'high' }, // Justice, James C. (R-WV)
    { deskId: 66, bioguideId: 'H001046', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Heinrich, Martin (D-NM)
    { deskId: 67, bioguideId: 'W000800', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Welch, Peter (D-VT)
    { deskId: 68, bioguideId: 'S001150', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Schiff, Adam B. (D-CA)
    { deskId: 69, bioguideId: 'L000570', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Luján, Ben Ray (D-NM)
    { deskId: 70, bioguideId: 'C001098', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Cruz, Ted (R-TX)
    { deskId: 71, bioguideId: 'H001042', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Hirono, Mazie K. (D-HI)
    { deskId: 72, bioguideId: 'S001232', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Sheehy, Tim (R-MT)
    { deskId: 73, bioguideId: 'S001198', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Sullivan, Dan (R-AK)
    { deskId: 74, bioguideId: 'C000880', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Crapo, Mike (R-ID)
    { deskId: 75, bioguideId: 'H000273', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Hickenlooper, John W. (D-CO)
    { deskId: 76, bioguideId: 'B001243', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Blackburn, Marsha (R-TN)
    { deskId: 77, bioguideId: 'V000137', assignedAt: '2025-01-03', vacatedAt: '2025-01-14', reason: 'newly_seated', confidence: 'high' }, // Vance, J.D. (R-OH)
    { deskId: 77, bioguideId: null, assignedAt: '2025-01-14', vacatedAt: '2025-01-21', reason: 'vacancy', confidence: 'high' }, // no senator shown
    { deskId: 77, bioguideId: 'H001104', assignedAt: '2025-01-21', vacatedAt: '2025-01-27', reason: 'reassigned', confidence: 'high' }, // Husted, Jon (R-OH)
    { deskId: 77, bioguideId: 'M001242', assignedAt: '2025-01-27', reason: 'reassigned', confidence: 'high' }, // Moreno, Bernie (R-OH)
    { deskId: 78, bioguideId: 'T000278', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Tuberville, Tommy (R-AL)
    { deskId: 79, bioguideId: 'P000603', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Paul, Rand (R-KY)
    { deskId: 80, bioguideId: 'F000479', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Fetterman, John (D-PA)
    { deskId: 81, bioguideId: 'F000463', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Fischer, Deb (R-NE)
    { deskId: 82, bioguideId: 'J000293', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Johnson, Ron (R-WI)
    { deskId: 83, bioguideId: 'W000817', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Warren, Elizabeth (D-MA)
    { deskId: 84, bioguideId: 'R000122', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Reed, Jack (D-RI)
    { deskId: 85, bioguideId: 'R000618', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Ricketts, Pete (R-NE)
    { deskId: 86, bioguideId: 'G000386', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Grassley, Chuck (R-IA)
    { deskId: 87, bioguideId: 'G000555', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Gillibrand, Kirsten E. (D-NY)
    { deskId: 88, bioguideId: 'B001277', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Blumenthal, Richard (D-CT)
    { deskId: 89, bioguideId: 'H001089', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Hawley, Josh (R-MO)
    { deskId: 90, bioguideId: 'B001267', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Bennet, Michael F. (D-CO)
    { deskId: 91, bioguideId: 'C001088', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Coons, Christopher A. (D-DE)
    { deskId: 92, bioguideId: 'E000295', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Ernst, Joni (R-IA)
    { deskId: 93, bioguideId: 'B001303', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Blunt Rochester, Lisa (D-DE)
    { deskId: 94, bioguideId: 'R000608', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Rosen, Jacky (D-NV)
    { deskId: 95, bioguideId: 'R000595', assignedAt: '2025-01-03', vacatedAt: '2025-01-21', reason: 'newly_seated', confidence: 'high' }, // Rubio, Marco (R-FL)
    { deskId: 95, bioguideId: 'M001244', assignedAt: '2025-01-21', reason: 'reassigned', confidence: 'high' }, // Moody, Ashley (R-FL)
    { deskId: 96, bioguideId: 'K000384', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Kaine, Tim (D-VA)
    { deskId: 97, bioguideId: 'P000145', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Padilla, Alex (D-CA)
    { deskId: 98, bioguideId: 'M001243', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // McCormick, David (R-PA)
    { deskId: 99, bioguideId: 'K000377', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Kelly, Mark (D-AZ)
    { deskId: 100, bioguideId: 'M000934', assignedAt: '2025-01-03', reason: 'newly_seated', confidence: 'high' }, // Moran, Jerry (R-KS)
  ],
  lineageRows: [
    // Desk 29, the Daniel Webster Desk. The plans show Judd Gregg here through
    // 2011-01-03 and Jeanne Shaheen from the plan dated 2011-03-23.
    { deskId: 29, yearStart: 2011, yearEnd: null, bioguideId: 'S001181', occupantName: 'Jeanne Shaheen', party: 'D', state: 'NH', notes: null, source: SOURCE },
    // Desk 60, the Jefferson Davis Desk. Thad Cochran through the plan dated
    // 2018-01-03, Roger Wicker from the plan dated 2018-04-09.
    { deskId: 60, yearStart: 2018, yearEnd: null, bioguideId: 'W000437', occupantName: 'Roger F. Wicker', party: 'R', state: 'MS', notes: null, source: SOURCE },
    // Desk 49. Markwayne Mullin from the plan dated 2023-01-23; it has been
    // the candy desk since 2025. Alan Armstrong from the plan dated 2026-03-24.
    { deskId: 49, yearStart: 2023, yearEnd: 2026, bioguideId: 'M001190', occupantName: 'Markwayne Mullin', party: 'R', state: 'OK', notes: 'The candy desk from 2025.', source: SOURCE },
    { deskId: 49, yearStart: 2026, yearEnd: null, bioguideId: 'A000383', occupantName: 'Alan Armstrong', party: 'R', state: 'OK', notes: 'The candy desk.', source: SOURCE },
  ],
};
