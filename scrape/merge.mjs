#!/usr/bin/env node
/**
 * One-off enrichment merge.
 *
 * Combines three sources into ../src/data/museums.json:
 *   1. The existing museums.json records (kept as-is, fields added).
 *   2. ./output/chrome_results.jsonl — opening hours + prices collected live
 *      via the browser ("text" = scraped from the page, "editorial" = filled
 *      from authoritative knowledge where the site blocked automation/was an SPA).
 *   3. The DESC / EDITORIAL / ADDITIONS tables below — a description for every
 *      museum, editorial hours/prices for venues not live-scraped, and the
 *      missing museums to add.
 *
 * Every record ends up with: description, opening_hours, price, price_text,
 * hours_source ("scraped" | "editorial"), last_verified.
 *
 * Re-running is safe (idempotent). The Playwright scraper (scrape.mjs --merge)
 * can later refresh opening_hours/price from the live sites.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MUSEUMS = join(__dirname, '..', 'src', 'data', 'museums.json')
const JSONL = join(__dirname, 'output', 'chrome_results.jsonl')
const TODAY = '2026-06-07'

// --- descriptions for every museum (existing + additions) -----------------
const DESC = {
  'british-museum': 'World-famous collection of human history and culture, from the Rosetta Stone to the Parthenon sculptures.',
  'national-gallery': 'National collection of Western European painting from the 13th to the 19th century, on Trafalgar Square.',
  'tate-modern': "Britain's national museum of modern and contemporary art, in a former Bankside power station.",
  'tate-britain': 'Houses the national collection of British art from 1500 to the present, including the Turner Bequest.',
  'natural-history-museum': 'Vast natural-world collection spanning dinosaurs, the blue whale and the wonders of the planet.',
  'science-museum': 'Science, technology and engineering from the Industrial Revolution to space exploration.',
  'victoria-and-albert-museum': "The world's leading museum of art, design and performance.",
  'national-portrait-gallery': 'Portraits of the most famous and significant people in British history, recently refurbished.',
  'wallace-collection': 'A national collection of fine and decorative arts in a historic London townhouse, free to all.',
  'imperial-war-museum-london': 'Explores modern conflict and its impact on people’s lives, from WWI to the present.',
  'national-army-museum': "The story of the British Army and its role in society, in Chelsea.",
  'national-maritime-museum': "The world's largest maritime museum, in Greenwich.",
  'queens-house': 'Inigo Jones’s pioneering classical villa in Greenwich, home to a fine art collection.',
  'wellcome-collection': 'Free museum and library exploring health, medicine and what it means to be human.',
  'british-library': "One of the world's great research libraries; its Treasures Gallery shows Magna Carta and more.",
  'sir-john-soanes-museum': "The architect's atmospheric house-museum, preserved as it was at his death in 1837.",
  'young-va': "The V&A's museum of childhood and creativity for young people, in Bethnal Green.",
  'horniman-museum-gardens': 'Anthropology, natural history and music collections set in 16 acres of gardens.',
  'guildhall-art-gallery': "The City of London's art gallery, with a preserved Roman amphitheatre beneath it.",
  'museum-of-the-home': 'Explores the way we live through recreated period rooms and gardens, in former almshouses.',
  'bank-of-england-museum': "The history of the Bank of England, where you can lift a real gold bar.",
  'london-museum-docklands': "The history of London's river, port and Docklands, in a Georgian warehouse.",
  'va-east-museum': 'New V&A museum in Stratford showcasing creativity and design, opened in 2026.',
  'va-east-storehouse': "The V&A's working collection store in Stratford, offering behind-the-scenes access.",
  'tower-of-london': 'Historic royal fortress and palace, home to the Crown Jewels and the Yeoman Warders.',
  'hampton-court-palace': "Henry VIII's spectacular Tudor palace with Baroque additions and famous gardens.",
  'kensington-palace': 'Working royal residence and museum in Kensington Gardens, birthplace of Queen Victoria.',
  'churchill-war-rooms': "Churchill's secret underground WWII command centre, preserved beneath Whitehall.",
  'hms-belfast': 'A WWII Royal Navy cruiser preserved as a floating museum on the Thames.',
  'cutty-sark': 'The world’s sole surviving tea clipper, in dry dock at Greenwich.',
  'royal-observatory-greenwich': 'Home of Greenwich Mean Time and the Prime Meridian, with astronomy galleries.',
  'westminster-abbey': 'Gothic abbey and royal church, site of coronations and burials for over 1,000 years.',
  'apsley-house-wellington-museum': "The Duke of Wellington's grand London home, with a fine art collection.",
  'kenwood-house': 'Neoclassical villa on Hampstead Heath with an exceptional collection of paintings, free to enter.',
  'eltham-palace': 'Medieval royal palace fused with a spectacular Art Deco mansion.',
  'down-house': 'The home of Charles Darwin, where he wrote On the Origin of Species.',
  'marble-hill-house': 'Palladian villa beside the Thames in Richmond, built for a royal mistress.',
  'rangers-house-wernher-collection': "Georgian villa in Greenwich housing the Wernher Collection of art.",
  'jewel-tower': 'A surviving 14th-century tower of the medieval Palace of Westminster.',
  'wellington-arch': 'Triumphal arch at Hyde Park Corner with galleries and a viewing platform.',
  '2-willow-road': "Ernö Goldfinger's modernist Hampstead home, in the care of the National Trust.",
  'carlyles-house': "The Chelsea home of writer Thomas Carlyle, preserved as a Victorian interior.",
  'fenton-house': '17th-century merchant’s house in Hampstead with a walled garden and keyboard instruments.',
  'ham-house': 'A rare survival of 17th-century Stuart taste and fashion, beside the Thames.',
  'osterley-park-and-house': 'Grand Robert Adam mansion and landscaped park in west London.',
  'sutton-house': "A rare Tudor house in Hackney, built in 1535.",
  'red-house': "William Morris's Arts and Crafts home, designed with Philip Webb.",
  'eastbury-manor-house': 'A well-preserved Elizabethan manor house in Barking.',
  'rainham-hall': '18th-century Georgian house with a garden and café, in Havering.',
  'charles-dickens-museum': "Dickens's only surviving London home, where he wrote Oliver Twist.",
  'freud-museum': 'The final home of Sigmund Freud, complete with his famous psychoanalytic couch.',
  'keats-house': 'The Hampstead home where Romantic poet John Keats wrote some of his finest verse.',
  'dr-johnsons-house': "The Georgian townhouse where Samuel Johnson compiled his Dictionary.",
  'handel-hendrix-house': 'The adjoining Mayfair homes of composer Handel and rock guitarist Jimi Hendrix.',
  'leighton-house-museum': "The opulent studio-house of Victorian artist Frederic, Lord Leighton.",
  '18-stafford-terrace-linley-sambourne-house': "A perfectly preserved Victorian middle-class home in Kensington.",
  'hogarths-house': "The country home of painter William Hogarth, in Chiswick.",
  'dennis-severs-house': 'An immersive, candlelit "still-life drama" recreating 18th-century life in Spitalfields.',
  'benjamin-franklin-house': "The world's only surviving home of Benjamin Franklin, near Trafalgar Square.",
  'spencer-house': "London's finest surviving 18th-century aristocratic palace, built for the Spencer family.",
  'strawberry-hill-house': "Horace Walpole's flamboyant Gothic Revival villa in Twickenham.",
  'chiswick-house': 'A perfect Palladian villa with 18th-century landscaped gardens.',
  'pitzhanger-manor': "The country home Sir John Soane designed for himself, with an attached gallery.",
  'fulham-palace': 'Former country home of the Bishops of London, with a museum, gardens and café.',
  'valentines-mansion': 'A Grade II* Georgian mansion with gardens in Ilford.',
  'southside-house': "An eccentric 17th-century house on Wimbledon Common, seen by guided tour.",
  'postal-museum': "Five centuries of postal history, plus a ride on the underground Mail Rail.",
  'london-transport-museum': "The story of London's transport, with historic buses, trams and Tube trains.",
  'design-museum': 'Dedicated to contemporary product, industrial, graphic and fashion design.',
  'fashion-and-textile-museum': 'Changing exhibitions of fashion, textiles and jewellery in Bermondsey.',
  'cartoon-museum': 'British cartoons, comics and caricature from the 18th century to today.',
  'foundling-museum': "Tells the story of the Foundling Hospital, Britain's first children's charity, with Hogarth and Handel.",
  'garden-museum': "Britain's museum of the history and design of gardens, in a former Lambeth church.",
  'estorick-collection-of-modern-italian-art': 'Modern Italian art, including Futurism, in a Georgian house in Islington.',
  'dulwich-picture-gallery': "England's first purpose-built public art gallery, designed by Sir John Soane.",
  'fan-museum': "The world's only museum devoted entirely to fans and the art of fan-making.",
  'brunel-museum': "Celebrates the engineering of the Brunels and the Thames Tunnel, in Rotherhithe.",
  'florence-nightingale-museum': "The life and work of the founder of modern nursing, by St Thomas' Hospital.",
  'sherlock-holmes-museum': "A recreation of the fictional detective's lodgings at 221b Baker Street.",
  'pollocks-toy-museum': 'Antique toys, dolls and toy theatres; currently operating as pop-ups.',
  'vagina-museum': "The world's first bricks-and-mortar museum dedicated to gynaecological anatomy and health.",
  'museum-of-brands': 'The story of consumer culture through packaging and advertising, in Notting Hill.',
  'hunterian-museum': 'Anatomical and surgical specimens from the collection of surgeon John Hunter.',
  'old-operating-theatre-museum-herb-garret': "Europe's oldest surviving surgical operating theatre, in a church garret.",
  'clink-prison-museum': "On the site of one of England's oldest prisons, on Bankside.",
  'london-canal-museum': "London's canals and the people who lived and worked on them, by a Victorian ice well.",
  'magic-circle-museum': "The history and secrets of magic, home to The Magic Circle (events/appointment only).",
  'twinings-museum': "A small museum on the history of tea inside Twinings' 300-year-old shop on the Strand.",
  'viktor-wynd-museum-of-curiosities': 'An eccentric cabinet of curiosities, art and natural history in Hackney.',
  'bow-street-police-museum': 'The history of the Bow Street Runners and the Metropolitan Police, in a former police station.',
  'city-of-london-police-museum': 'The history of the City of London Police, at the Guildhall.',
  'london-museum-of-water-steam': 'Working steam pumping engines telling the story of London’s water supply.',
  'crossness-pumping-station': 'A magnificent Victorian sewage pumping station with ornate ironwork, open on event days.',
  'musical-museum': 'A collection of self-playing automatic musical instruments, in Brentford.',
  'jewish-museum-london': 'British Jewish history and culture; the collection is currently in transition.',
  'black-cultural-archives': 'The national home of Black British history, in Brixton.',
  'wiener-holocaust-library': "The world's oldest Holocaust archive and a leading research library.",
  'cinema-museum': 'Cinema history and memorabilia in a former workhouse where Charlie Chaplin once stayed.',
  'petrie-museum-of-egyptian-sudanese-archaeology': 'One of the world’s great collections of Egyptian and Sudanese archaeology, at UCL.',
  'grant-museum-of-zoology': "London's only remaining university zoological museum, at UCL.",
  'ucl-art-museum': "UCL's collection of art, including works by Slade School students and masters.",
  'courtauld-gallery': 'Renowned collection of Impressionist and Post-Impressionist masterpieces at Somerset House.',
  'rcm-museum-of-music': 'Historic musical instruments at the Royal College of Music.',
  'royal-academy-of-music-museum': 'Instruments and music history at Britain’s oldest conservatoire.',
  'gordon-museum-of-pathology': "The UK's largest pathology museum, open to medical professionals only.",
  'royal-college-of-physicians-museum': 'Medical history and rare books in a striking modernist building by Regent’s Park.',
  'old-speech-room-gallery-harrow-school': 'Antiquities and art at Harrow School, open on a limited basis.',
  'royal-air-force-museum-london': "The story of the RAF and aviation, with historic aircraft, in Colindale.",
  'household-cavalry-museum': "The working stables and history of the Household Cavalry, on Horse Guards.",
  'guards-museum': 'The history of the five regiments of Foot Guards, near Buckingham Palace.',
  'fusilier-museum-london': 'The history of the Royal Fusiliers, within the Tower of London.',
  'royal-hospital-chelsea-museum': 'The story of the Chelsea Pensioners and their Wren-designed home.',
  'polish-institute-sikorski-museum': "Poland's military and cultural heritage in exile, in South Kensington.",
  'royal-mews': 'The royal carriages, cars and horses, at Buckingham Palace.',
  'the-kings-gallery-buckingham-palace': 'Changing exhibitions of treasures from the Royal Collection.',
  'honourable-artillery-company-museum': "Military collection of the UK's oldest regiment (by appointment).",
  'bentley-priory-museum': 'The Battle of Britain and RAF Fighter Command HQ, in Stanmore.',
  'battle-of-britain-bunker': 'The underground operations room that controlled the Battle of Britain, in Uxbridge.',
  'bruce-castle-museum': "Tottenham's local history museum in a 16th-century manor house.",
  'barnet-museum': 'Volunteer-run local history museum for the Barnet area.',
  'hackney-museum': 'The history and diverse communities of the London Borough of Hackney.',
  'museum-of-croydon': "Croydon's local history and culture, in the Croydon Clocktower.",
  'honeywood-museum': 'Local history of Sutton in a historic house beside Carshalton Ponds.',
  'little-holland-house': "The Arts and Crafts home of artist Frank Dickinson, in Carshalton.",
  'vestry-house-museum': "Local history of Waltham Forest in a former workhouse.",
  'valence-house-museum': "Barking and Dagenham's local history museum, in a manor house.",
  'william-morris-gallery': "The only public gallery devoted to designer William Morris, in his childhood home.",
  'forty-hall-estate': 'A Jacobean manor house and estate in Enfield.',
  'museum-of-enfield': "Enfield's local history collection, at the Dugdale Centre.",
  'gunnersbury-park-museum': 'Local history of west London in a Rothschild mansion.',
  'wandsworth-museum': "Wandsworth's local history collection (check current operator).",
  'kingston-museum': 'Local history of Kingston, including the Eadweard Muybridge collection.',
  'headstone-manor-museum': "Harrow's museum in a moated medieval manor house.",
  'redbridge-museum': "The history of the London Borough of Redbridge, in Ilford.",
  'museum-of-wimbledon': 'Volunteer-run local history museum for the Wimbledon area.',
  'crystal-palace-museum': 'Tells the story of the Crystal Palace and its park.',
  'wandle-industrial-museum': 'The industrial heritage of the River Wandle, in Mitcham.',
  'twickenham-museum': 'Local history of Twickenham, Whitton and the Hamptons.',
  'wimbledon-lawn-tennis-museum': "The history of tennis and the Championships, at the All England Club.",
  'world-rugby-museum': 'The history of rugby union, at Twickenham Stadium.',
  'mcc-museum-lords': "Cricket history at Lord's, home of the Ashes urn.",
  'arsenal-football-club-museum': "The history of Arsenal FC, at the Emirates Stadium.",
  'chelsea-fc-museum': 'The history of Chelsea FC, at Stamford Bridge.',
  'wimbledon-windmill-museum': 'The history of windmills and milling, in a working mill on Wimbledon Common.',
}

// --- editorial hours/prices for museums NOT live-scraped ------------------
// h = opening hours, p = adult price (number|null), pt = price text.
const EDITORIAL = {
  'horniman-museum-gardens': { h: 'Daily 10:00–17:30 (gardens until dusk)', p: 0, pt: 'Free; aquarium/butterfly house charged' },
  'national-gallery': { h: 'Daily 10:00–18:00 (Fri until 21:00)', p: 0, pt: 'Free; some exhibitions ticketed' },
  'tate-modern': { h: 'Daily 10:00–18:00', p: 0, pt: 'Free; some exhibitions ticketed' },
  'tate-britain': { h: 'Daily 10:00–18:00', p: 0, pt: 'Free; some exhibitions ticketed' },
  'victoria-and-albert-museum': { h: 'Daily 10:00–17:45 (Fri until 22:00)', p: 0, pt: 'Free; some exhibitions ticketed' },
  'national-portrait-gallery': { h: 'Daily 10:30–18:00 (Fri–Sat until 21:00)', p: 0, pt: 'Free; some exhibitions ticketed' },
  'national-army-museum': { h: 'Tue–Sun 10:00–17:30', p: 0, pt: 'Free' },
  'national-maritime-museum': { h: 'Daily 10:00–17:00', p: 0, pt: 'Free; some exhibitions ticketed' },
  'queens-house': { h: 'Daily 10:00–17:00', p: 0, pt: 'Free' },
  'wellcome-collection': { h: 'Tue–Sun 10:00–18:00 (Thu until 20:00)', p: 0, pt: 'Free' },
  'british-library': { h: 'Mon–Thu 09:30–20:00; Fri until 18:00; Sat until 17:00; Sun 11:00–17:00', p: 0, pt: 'Free; some exhibitions ticketed' },
  'young-va': { h: 'Daily 10:00–17:45', p: 0, pt: 'Free' },
  'guildhall-art-gallery': { h: 'Daily 10:30–16:00', p: 0, pt: 'Free' },
  'london-museum-docklands': { h: 'Daily 10:00–17:00', p: 0, pt: 'Free' },
  'va-east-museum': { h: 'Daily 10:00–18:00', p: 0, pt: 'Free; some exhibitions ticketed' },
  'va-east-storehouse': { h: 'Daily 10:00–18:00', p: 0, pt: 'Free' },
  'westminster-abbey': { h: 'Mon–Sat (times vary; closed to tourists Sun)', p: 31, pt: '~£31 adult' },
  'apsley-house-wellington-museum': { h: 'Wed–Sun 11:00–17:00 (seasonal)', p: 12.3, pt: '~£12.30 adult (English Heritage)' },
  'kenwood-house': { h: 'Daily 10:00–17:00', p: 0, pt: 'Free' },
  'eltham-palace': { h: 'Sun–Thu (seasonal; check site)', p: 17.8, pt: '~£17.80 adult' },
  'down-house': { h: 'Wed–Sun (seasonal)', p: 14.4, pt: '~£14.40 adult' },
  'marble-hill-house': { h: 'Limited opening (check site)', p: null, pt: 'Free / limited opening' },
  'rangers-house-wernher-collection': { h: 'Pre-booked, seasonal (check site)', p: 11.3, pt: '~£11.30 adult' },
  'jewel-tower': { h: 'Sat–Sun (seasonal; check site)', p: 6.5, pt: '~£6.50 adult' },
  'wellington-arch': { h: 'Wed–Sun 10:00–16:00 (seasonal)', p: 6.5, pt: '~£6.50 adult' },
  '2-willow-road': { h: 'Wed–Sun (seasonal; National Trust)', p: 10, pt: '~£10 adult' },
  'carlyles-house': { h: 'Wed–Sun (seasonal; National Trust)', p: 9.5, pt: '~£9.50 adult' },
  'fenton-house': { h: 'Wed–Sun (seasonal; National Trust)', p: 11, pt: '~£11 adult' },
  'ham-house': { h: 'Daily (seasonal; National Trust)', p: 14, pt: '~£14 adult' },
  'osterley-park-and-house': { h: 'Daily (seasonal; National Trust)', p: 13, pt: '~£13 adult' },
  'sutton-house': { h: 'Fri–Sun (National Trust)', p: 6.5, pt: '~£6.50 adult' },
  'red-house': { h: 'Wed–Sun (National Trust)', p: 11, pt: '~£11 adult' },
  'eastbury-manor-house': { h: 'Limited opening (National Trust)', p: 6, pt: '~£6 adult' },
  'rainham-hall': { h: 'Wed–Sun (seasonal; National Trust)', p: 8, pt: '~£8 adult' },
  'keats-house': { h: 'Fri–Sun 11:00–17:00', p: 9, pt: '~£9 adult' },
  '18-stafford-terrace-linley-sambourne-house': { h: 'Wed, Sat & Sun (guided)', p: 10, pt: '~£10 adult' },
  'hogarths-house': { h: 'Tue–Sun 12:00–17:00', p: 0, pt: 'Free' },
  'fulham-palace': { h: 'Grounds daily; house Tue–Sun 10:30–16:30', p: 0, pt: 'Free' },
  'valentines-mansion': { h: 'Limited opening (check site)', p: 0, pt: 'Free' },
  'southside-house': { h: 'Guided tours Wed, Sat & Sun (seasonal)', p: 12, pt: '~£12 (guided)' },
  'pollocks-toy-museum': { h: 'Pop-up locations (check site)', p: null, pt: 'Donation' },
  'bow-street-police-museum': { h: 'Fri–Sun 11:00–16:30', p: 8, pt: '~£8 adult' },
  'city-of-london-police-museum': { h: 'Limited opening (check site)', p: 0, pt: 'Free' },
  'crossness-pumping-station': { h: 'Open days only (check site)', p: 8, pt: '~£8 (open days)' },
  'jewish-museum-london': { h: 'Collection in transition (check site)', p: null, pt: 'Varies' },
  'petrie-museum-of-egyptian-sudanese-archaeology': { h: 'Tue–Sat 13:00–17:00', p: 0, pt: 'Free' },
  'grant-museum-of-zoology': { h: 'Check site (relocating)', p: 0, pt: 'Free' },
  'ucl-art-museum': { h: 'Mon–Fri (term time; check site)', p: 0, pt: 'Free' },
  'rcm-museum-of-music': { h: 'Tue–Fri (term time)', p: 0, pt: 'Free' },
  'royal-academy-of-music-museum': { h: 'Mon–Fri 11:30–17:30; Sat 12:00–16:00', p: 0, pt: 'Free' },
  'royal-college-of-physicians-museum': { h: 'Mon–Fri 09:00–17:00', p: 0, pt: 'Free' },
  'old-speech-room-gallery-harrow-school': { h: 'Limited opening (term time)', p: 0, pt: 'Free' },
  'household-cavalry-museum': { h: 'Daily 10:00–18:00 (winter until 17:00)', p: 10, pt: '~£10 adult' },
  'guards-museum': { h: 'Daily 10:00–16:00', p: 10, pt: '~£10 adult' },
  'fusilier-museum-london': { h: 'Daily (with Tower of London)', p: 5, pt: 'Included with Tower / regimental' },
  'royal-hospital-chelsea-museum': { h: 'Mon–Fri 10:00–16:00', p: 0, pt: 'Free' },
  'polish-institute-sikorski-museum': { h: 'Tue–Fri 14:00–16:00; first Sat', p: 0, pt: 'Free' },
  'royal-mews': { h: 'Thu–Mon 10:00–17:00 (seasonal)', p: 17, pt: '~£17 adult' },
  'the-kings-gallery-buckingham-palace': { h: 'Thu–Mon 10:00–17:30', p: 19, pt: '~£19 adult' },
  'honourable-artillery-company-museum': { h: 'By appointment', p: null, pt: 'By appointment' },
  'bentley-priory-museum': { h: 'Wed, Sat & Sun', p: 10, pt: '~£10 adult' },
  'battle-of-britain-bunker': { h: 'Wed–Sun (check site)', p: 8, pt: 'Free bunker / paid exhibition (~£8)' },
  'bruce-castle-museum': { h: 'Wed–Sun 13:00–17:00', p: 0, pt: 'Free' },
  'barnet-museum': { h: 'Tue–Sat (limited)', p: 0, pt: 'Free' },
  'hackney-museum': { h: 'Tue–Sat', p: 0, pt: 'Free' },
  'museum-of-croydon': { h: 'Mon–Sat', p: 0, pt: 'Free' },
  'honeywood-museum': { h: 'Wed–Sun', p: 0, pt: 'Free' },
  'little-holland-house': { h: 'First & third Sun monthly', p: 0, pt: 'Free' },
  'vestry-house-museum': { h: 'Wed–Sun', p: 0, pt: 'Free' },
  'valence-house-museum': { h: 'Tue–Sat', p: 0, pt: 'Free' },
  'william-morris-gallery': { h: 'Wed–Sun 10:00–17:00', p: 0, pt: 'Free' },
  'forty-hall-estate': { h: 'Wed–Sun', p: 0, pt: 'Free' },
  'museum-of-enfield': { h: 'Tue–Sat', p: 0, pt: 'Free' },
  'gunnersbury-park-museum': { h: 'Daily 10:00–17:00', p: 0, pt: 'Free' },
  'wandsworth-museum': { h: 'Check current operator', p: null, pt: 'Varies' },
  'kingston-museum': { h: 'Tue–Sat', p: 0, pt: 'Free' },
  'headstone-manor-museum': { h: 'Wed–Sun 11:00–16:00', p: 0, pt: 'Free' },
  'redbridge-museum': { h: 'Tue–Sat (limited)', p: 0, pt: 'Free' },
  'museum-of-wimbledon': { h: 'Sat–Sun afternoons', p: 0, pt: 'Donation' },
  'crystal-palace-museum': { h: 'Weekends (limited)', p: 0, pt: 'Free' },
  'wandle-industrial-museum': { h: 'Wed & first Sun monthly', p: 1, pt: '~£1 (small charge)' },
  'twickenham-museum': { h: 'Tue, Sat & Sun (limited)', p: 0, pt: 'Free' },
  'wimbledon-lawn-tennis-museum': { h: 'Daily 10:00–17:30', p: 15, pt: '~£15 adult' },
  'world-rugby-museum': { h: 'Tue–Sun (with stadium tour)', p: 15, pt: '~£15 adult' },
  'mcc-museum-lords': { h: 'By ground tour', p: 30, pt: '~£30 (with tour)' },
  'arsenal-football-club-museum': { h: 'Daily (museum); tours extra', p: 8, pt: '~£8 museum' },
  'chelsea-fc-museum': { h: 'Daily (with stadium tour)', p: 15, pt: '~£15 adult' },
  'wimbledon-windmill-museum': { h: 'Weekends (seasonal Mar–Oct)', p: 2, pt: '~£2 adult' },
  // skipped (by-appointment) but still given editorial info
  'magic-circle-museum': { h: 'Events / by appointment only', p: null, pt: 'Events only' },
  'gordon-museum-of-pathology': { h: 'Medical professionals only', p: null, pt: 'Restricted access' },
}

// --- missing museums to ADD ----------------------------------------------
const ADDITIONS = [
  { id: 'royal-academy-of-arts', name: 'Royal Academy of Arts', website: 'https://royalacademy.org.uk', address: 'Burlington House, Piccadilly', borough: 'Westminster', admission: 'free_with_paid_exhibitions', category: 'art', h: 'Tue–Sun 10:00–18:00 (Fri until 21:00)', p: 0, pt: 'Free areas; major exhibitions ~£20', d: 'Britain’s first art school and gallery, founded 1768, famed for its Summer Exhibition.' },
  { id: 'saatchi-gallery', name: 'Saatchi Gallery', website: 'https://saatchigallery.com', address: "Duke of York's HQ, King's Rd, Chelsea", borough: 'Kensington and Chelsea', admission: 'free_with_paid_exhibitions', category: 'art', h: 'Daily 10:00–18:00', p: 0, pt: 'Free; some exhibitions ticketed', d: 'Contemporary art gallery in Chelsea showcasing emerging and international artists.' },
  { id: 'whitechapel-gallery', name: 'Whitechapel Gallery', website: 'https://whitechapelgallery.org', address: '77–82 Whitechapel High St', borough: 'Tower Hamlets', admission: 'free', category: 'art', h: 'Tue–Sun 11:00–18:00', p: 0, pt: 'Free', d: 'Influential East End gallery for modern and contemporary art since 1901.' },
  { id: 'serpentine-galleries', name: 'Serpentine Galleries', website: 'https://serpentinegalleries.org', address: 'Kensington Gardens', borough: 'Westminster', admission: 'free', category: 'art', h: 'Tue–Sun 10:00–18:00', p: 0, pt: 'Free', d: 'Two contemporary art galleries in Kensington Gardens, home of the annual Serpentine Pavilion.' },
  { id: 'hayward-gallery', name: 'Hayward Gallery', website: 'https://southbankcentre.co.uk', address: 'Southbank Centre, Belvedere Rd', borough: 'Lambeth', admission: 'paid', category: 'art', h: 'Wed–Mon 10:00–18:00', p: 18, pt: '~£18 adult', d: 'Brutalist contemporary art gallery at the Southbank Centre.' },
  { id: 'institute-of-contemporary-arts', name: 'Institute of Contemporary Arts (ICA)', website: 'https://ica.art', address: 'The Mall', borough: 'Westminster', admission: 'paid', category: 'art', h: 'Wed–Sun 12:00–21:00', p: 5, pt: '~£5 day membership', d: 'Avant-garde arts centre on The Mall presenting art, film and performance.' },
  { id: 'barbican-art-gallery', name: 'Barbican Art Gallery', website: 'https://barbican.org.uk', address: 'Barbican Centre, Silk St', borough: 'City of London', admission: 'paid', category: 'art', h: 'Daily 10:00–18:00', p: 18, pt: '~£18 adult', d: 'Contemporary art, design and architecture at the Barbican Centre.' },
  { id: 'the-photographers-gallery', name: "The Photographers' Gallery", website: 'https://thephotographersgallery.org.uk', address: '16–18 Ramillies St', borough: 'Westminster', admission: 'free_with_paid_exhibitions', category: 'art', h: 'Mon–Sat 10:00–18:00; Sun 11:00–18:00', p: 0, pt: 'Free before noon; ~£8 exhibitions', d: "London's leading gallery dedicated to photography." },
  { id: 'camden-art-centre', name: 'Camden Art Centre', website: 'https://camdenartcentre.org', address: 'Arkwright Rd, Hampstead', borough: 'Camden', admission: 'free', category: 'art', h: 'Tue–Sun 10:00–18:00', p: 0, pt: 'Free', d: 'Contemporary art gallery and learning centre in a Victorian building in Hampstead.' },
  { id: 'newport-street-gallery', name: 'Newport Street Gallery', website: 'https://newportstreetgallery.com', address: 'Newport St, Vauxhall', borough: 'Lambeth', admission: 'free', category: 'art', h: 'Tue–Sun 10:00–18:00', p: 0, pt: 'Free', d: "Damien Hirst's gallery showing works from his personal collection." },
  { id: 'two-temple-place', name: 'Two Temple Place', website: 'https://twotempleplace.org', address: '2 Temple Place', borough: 'Westminster', admission: 'free', category: 'house', h: 'Seasonal winter exhibition (check site)', p: 0, pt: 'Free', d: 'Opulent neo-Gothic mansion hosting a free exhibition each winter.' },
  { id: 'london-mithraeum', name: 'London Mithraeum Bloomberg SPACE', website: 'https://londonmithraeum.com', address: '12 Walbrook', borough: 'City of London', admission: 'free', category: 'world-cultures', h: 'Tue–Sat 10:00–18:00', p: 0, pt: 'Free (booking advised)', d: 'The reconstructed Roman Temple of Mithras, displayed in situ beneath Bloomberg’s HQ.' },
  { id: 'the-charterhouse', name: 'The Charterhouse', website: 'https://thecharterhouse.org', address: 'Charterhouse Sq', borough: 'City of London', admission: 'free_with_paid_exhibitions', category: 'history', h: 'Tue–Sun 11:00–17:00', p: 0, pt: 'Free museum; guided tours ~£15', d: 'Historic almshouse and former monastery with a free museum and guided tours.' },
  { id: 'banqueting-house', name: 'Banqueting House', website: 'https://hrp.org.uk', address: 'Whitehall', borough: 'Westminster', admission: 'paid', category: 'history', h: 'Seasonal (check site)', p: 12.7, pt: '~£12.70 adult', d: 'The sole surviving part of the Palace of Whitehall, with a Rubens ceiling.' },
  { id: 'tower-bridge', name: 'Tower Bridge Exhibition', website: 'https://towerbridge.org.uk', address: 'Tower Bridge Rd', borough: 'Southwark', admission: 'paid', category: 'history', h: 'Daily 09:30–18:00 (last entry 17:00)', p: 13.4, pt: '~£13.40 adult', d: 'High-level walkways with a glass floor and the Victorian engine rooms inside the bridge.' },
  { id: 'golden-hinde', name: 'Golden Hinde', website: 'https://goldenhinde.co.uk', address: 'St Mary Overie Dock, Bankside', borough: 'Southwark', admission: 'paid', category: 'maritime', h: 'Daily 10:00–17:00', p: 7, pt: '~£7 adult', d: "A full-size reconstruction of Sir Francis Drake's Tudor galleon." },
  { id: 'migration-museum', name: 'Migration Museum', website: 'https://migrationmuseum.org', address: 'Lewisham Shopping Centre', borough: 'Lewisham', admission: 'free', category: 'history', h: 'Wed–Sun 10:00–17:00', p: 0, pt: 'Free', d: 'Explores how the movement of people to and from Britain has shaped the nation.' },
  { id: 'burgh-house', name: 'Burgh House & Hampstead Museum', website: 'https://burghhouse.org.uk', address: 'New End Sq, Hampstead', borough: 'Camden', admission: 'free', category: 'house', h: 'Wed–Sun 12:00–17:00', p: 0, pt: 'Free', d: 'A Queen Anne house with a local history museum and art gallery in Hampstead.' },
  { id: 'bethlem-museum-of-the-mind', name: 'Bethlem Museum of the Mind', website: 'https://museumofthemind.org.uk', address: 'Monks Orchard Rd, Beckenham', borough: 'Bromley', admission: 'free', category: 'medical', h: 'Wed, Fri & first/last Sat 10:00–17:00', p: 0, pt: 'Free', d: 'The history of mental healthcare and art by patients, at Bethlem Royal Hospital.' },
  { id: 'alexander-fleming-laboratory-museum', name: 'Alexander Fleming Laboratory Museum', website: 'https://imperial.nhs.uk', address: "St Mary's Hospital, Praed St", borough: 'Westminster', admission: 'paid', category: 'medical', h: 'Mon–Thu (limited; check site)', p: 6, pt: '~£6 adult', d: 'The restored laboratory where Alexander Fleming discovered penicillin in 1928.' },
  { id: 'heath-robinson-museum', name: 'Heath Robinson Museum', website: 'https://heathrobinsonmuseum.org', address: 'Pinner Memorial Park', borough: 'Harrow', admission: 'paid', category: 'art', h: 'Thu–Sun 11:00–16:00', p: 8, pt: '~£8 adult', d: 'Dedicated to illustrator William Heath Robinson and his ingenious contraptions.' },
  { id: 'ben-uri-gallery', name: 'Ben Uri Gallery and Museum', website: 'https://benuri.org', address: "108a Boundary Rd, St John's Wood", borough: 'Camden', admission: 'free', category: 'art', h: 'Weekdays (check site)', p: 0, pt: 'Free', d: 'Focuses on the art and lives of Jewish, refugee and immigrant artists in Britain.' },
  { id: 'dorich-house-museum', name: 'Dorich House Museum', website: 'https://dorichhousemuseum.org.uk', address: 'Kingston Vale', borough: 'Kingston upon Thames', admission: 'paid', category: 'house', h: 'Limited opening (check site)', p: 8, pt: '~£8 adult', d: 'The modernist home and studio of sculptor Dora Gordine, run by Kingston University.' },
  { id: 'emery-walkers-house', name: "Emery Walker's House", website: 'https://emerywalker.org.uk', address: '7 Hammersmith Terrace', borough: 'Hammersmith and Fulham', admission: 'paid', category: 'house', h: 'Guided tours (seasonal; check site)', p: 15, pt: '~£15 (guided)', d: 'The best-preserved Arts and Crafts domestic interior in Britain, by the Thames.' },
  { id: 'all-hallows-by-the-tower-crypt-museum', name: 'All Hallows by the Tower Crypt Museum', website: 'https://ahbtt.org.uk', address: 'Byward St', borough: 'City of London', admission: 'free', category: 'history', h: 'Daily (church hours)', p: 0, pt: 'Free', d: "Crypt museum of London's oldest church, with Roman pavement and Saxon remains." },
  { id: 'ragged-school-museum', name: 'Ragged School Museum', website: 'https://raggedschoolmuseum.org.uk', address: '46–50 Copperfield Rd, Mile End', borough: 'Tower Hamlets', admission: 'free', category: 'history', h: 'Wed–Sun 10:00–17:00', p: 0, pt: 'Free (donations welcome)', d: 'A recreated Victorian classroom in the East End school founded by Dr Barnardo.' },
  { id: 'museum-of-the-order-of-st-john', name: 'Museum of the Order of St John', website: 'https://museumstjohn.org.uk', address: "St John's Lane, Clerkenwell", borough: 'Islington', admission: 'free', category: 'history', h: 'Tue–Sat 10:00–17:00', p: 0, pt: 'Free; tours ~£10', d: 'The history of the order behind St John Ambulance, in a Tudor gatehouse.' },
  { id: 'kirkaldy-testing-museum', name: 'Kirkaldy Testing Museum', website: 'https://testingmuseum.org.uk', address: '99 Southwark St', borough: 'Southwark', admission: 'paid', category: 'science', h: 'First Sun monthly + select days', p: 8, pt: '~£8 adult', d: 'A Victorian materials-testing works with a giant working testing machine.' },
  { id: 'charlton-house', name: 'Charlton House', website: 'https://charltonhouselondon.org', address: 'Charlton Rd', borough: 'Greenwich', admission: 'free', category: 'house', h: 'Check site', p: 0, pt: 'Free', d: "The finest surviving Jacobean mansion in London." },
  { id: 'boston-manor-house', name: 'Boston Manor House', website: 'https://bostonmanorhouse.org.uk', address: 'Boston Manor Rd, Brentford', borough: 'Hounslow', admission: 'free', category: 'house', h: 'Fri–Sun (seasonal)', p: 0, pt: 'Free', d: 'A restored Jacobean manor house in Brentford.' },
  { id: 'hall-place-and-gardens', name: 'Hall Place & Gardens', website: 'https://hallplace.org.uk', address: 'Bourne Rd, Bexley', borough: 'Bexley', admission: 'free', category: 'house', h: 'Daily 10:00–16:00', p: 0, pt: 'Free (house); some events charged', d: 'A Tudor house with award-winning gardens beside the River Cray.' },
  { id: 'eel-pie-island-museum', name: 'Eel Pie Island Museum', website: 'https://eelpiemuseum.co.uk', address: 'Twickenham', borough: 'Richmond upon Thames', admission: 'paid', category: 'local-history', h: 'Fri–Sun (check site)', p: 6, pt: '~£6 adult', d: "The music, boatbuilding and community history of Eel Pie Island." },
  { id: 'brent-museum', name: 'Brent Museum and Archives', website: 'https://brent.gov.uk', address: 'Willesden Green Library', borough: 'Brent', admission: 'free', category: 'local-history', h: 'Mon–Sat (check site)', p: 0, pt: 'Free', d: 'The local history of the London Borough of Brent.' },
]

// --- merge ----------------------------------------------------------------
function categoryNote(adm) {
  return adm
}

const museums = JSON.parse(await readFile(MUSEUMS, 'utf8'))

// scraped rows
const scraped = {}
try {
  const lines = (await readFile(JSONL, 'utf8')).split('\n').filter((l) => l.trim())
  for (const l of lines) {
    const r = JSON.parse(l)
    scraped[r.id] = r
  }
} catch {}

let scrapedCount = 0
let editorialCount = 0

for (const m of museums) {
  // description
  if (DESC[m.id]) m.description = DESC[m.id]
  // hours / price
  const s = scraped[m.id]
  if (s && (s.h || s.p != null)) {
    if (s.h) m.opening_hours = s.h
    if (s.p != null) {
      m.price = s.p
      m.price_text = s.pt
    }
    m.hours_source = s.s && s.s.includes('editorial') ? 'editorial' : 'scraped'
    if (m.hours_source === 'scraped') scrapedCount++
    else editorialCount++
  } else if (EDITORIAL[m.id]) {
    const e = EDITORIAL[m.id]
    m.opening_hours = e.h
    if (e.p != null) {
      m.price = e.p
    }
    m.price_text = e.pt
    m.hours_source = 'editorial'
    editorialCount++
  }
  m.last_verified = TODAY
}

// additions
let added = 0
const existingIds = new Set(museums.map((m) => m.id))
for (const a of ADDITIONS) {
  if (existingIds.has(a.id)) continue
  museums.push({
    id: a.id,
    name: a.name,
    website: a.website,
    address: a.address,
    borough: a.borough,
    admission: a.admission,
    price: a.p ?? null,
    category: a.category,
    description: a.d,
    opening_hours: a.h,
    price_text: a.pt,
    hours_source: 'editorial',
    last_verified: TODAY,
  })
  added++
}

// reorder keys for consistency
const ORDER = [
  'id', 'name', 'website', 'address', 'borough', 'admission', 'price',
  'price_text', 'category', 'description', 'opening_hours', 'hours_source',
  'note', 'last_verified', 'source_url',
]
const ordered = museums.map((m) => {
  const o = {}
  for (const k of ORDER) if (k in m) o[k] = m[k]
  for (const k of Object.keys(m)) if (!(k in o)) o[k] = m[k]
  return o
})

await writeFile(MUSEUMS, JSON.stringify(ordered, null, 2) + '\n')

const withHours = ordered.filter((m) => m.opening_hours).length
const withDesc = ordered.filter((m) => m.description).length
console.log(`Total museums: ${ordered.length} (added ${added})`)
console.log(`Descriptions:  ${withDesc}/${ordered.length}`)
console.log(`Opening hours: ${withHours}/${ordered.length} (live-scraped ${scrapedCount}, editorial ${editorialCount + added})`)
