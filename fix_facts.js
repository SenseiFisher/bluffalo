const fs = require('fs');
const facts = JSON.parse(fs.readFileSync('C:/Git/bluffalo/content/facts.json', 'utf8'));

const fixes = {
  // Strip HTML + rephrase ROAD TRIP / CELEBRITY TWEET entries
  FACT_104: 'The post office in Port Vila, Vanuatu is unusual because it is _______.',
  FACT_109: 'An auto repair shop in Florence, New Jersey claims to house an operational toilet once owned by _______.',
  FACT_129: 'For his voiceover work in Texas Chainsaw Massacre, John Larroquette was paid not with money, but with _______.',
  FACT_141: 'A sequel to Beetlejuice titled Beetlejuice Goes _______ was written but never produced.',
  FACT_148: 'There is a Stonehenge replica in Alliance, Nebraska built entirely out of _______.',
  FACT_152: 'In a 2012 public poll, Denzel Washington was voted the top choice to play the character of _______.',
  FACT_180: 'The movie G.I. Jane was retitled _______ Female Soldier for Chinese audiences.',
  FACT_194: 'A urologist wrote a self-help book titled The Joy of Un_______!',
  FACT_198: 'Barbara E. Mattick wrote a historical guide about bone _______ from the 19th and early 20th centuries.',
  FACT_204: 'Country singer Blake Shelton once tweeted that he gashed his hand open while running from _______.',
  FACT_208: 'There is a mountain in Washington state officially named _______ Dick Mountain.',
  FACT_234: 'The Eiffel Tower replica in Paris, Texas is topped with a giant red _______.',
  FACT_237: 'Chosen, Shunned and Reckoning are all books in an unusual series about _______ vampires.',
  FACT_242: 'Roselawn, Indiana has a giant sundial built to resemble a _______.',
  FACT_252: 'According to scientists, tiger urine smells remarkably like _______.',
  FACT_285: 'In Nepal, two villages hold an annual 10-day _______ Festival.',
  FACT_287: 'Before becoming pope, Pope Pius II wrote an erotic novel titled The Tale of the _______.',
  FACT_295: 'A study found that cows produce 5% more milk when they are given _______.',
  FACT_311: 'On the Hawaiian island of Molokai, the post office allows visitors to mail _______ without any packaging.',
  FACT_315: 'When Roald Dahl died, he was buried alongside snooker cues, burgundy, chocolate, pencils, and a _______.',
  FACT_322: 'Near Vancouver, British Columbia, there is a mountain officially called _______ Mountain.',
  FACT_325: 'Mohammed Khurshid Hussain holds a world record for his ability to _______ very quickly using only his nose.',
  FACT_326: 'Actor George C. Scott rejected his Oscar, calling the Academy Awards a "two-hour _______ parade".',
  FACT_327: 'In Marfa, Texas, there is a full-size art installation shaped like a _______ store, built in the middle of the desert.',
  FACT_331: 'The city of Lafayette, Louisiana has a public statue of a shirtless _______.',
  FACT_336: 'Blair Tolman wrote a self-help book called _______ for Under a Dollar: 301 Ideas.',
  FACT_343: 'Pamela Anderson wrote a cookbook titled How to Cook Without a _______.',
  FACT_348: 'At an annual festival in Laza, Spain, participants pelt each other with muddy rags filled with _______.',
  FACT_349: 'The $6 million cathedral in Christchurch, New Zealand is made out of _______.',
  FACT_351: 'Coca-Cola once commissioned an Atari video game called Pepsi _______.',
  FACT_354: 'Psycho was the first American film to show a _______ on screen.',
  FACT_359: 'The New York Times issued a correction after incorrectly identifying Mario and Luigi as _______ instead of plumbers.',
  FACT_370: 'Chad Orzel wrote a book called How to Teach _______ to Your Dog.',
  FACT_371: 'The 1995 Diagram Prize for Oddest Book Title went to a book called Reusing Old _______.',
  // Convert final-format prompts to fill-in-the-blank sentences
  FACT_383: 'The rock band Queen was originally called _______.',
  FACT_384: 'A group of porcupines is called a _______.',
  FACT_385: 'The secret codename for the 1940s project that invented the microwave oven was _______.',
  FACT_386: 'The man depicted on the Quaker Oats label has the official name _______.',
  FACT_387: 'Pepsi was originally sold under the name _______.',
  FACT_388: 'About 180 miles south of New Zealand lies a remote island called _______.',
  FACT_389: "In Gene Roddenberry's original Star Trek script, the starship was named the _______.",
  FACT_390: 'The game of bingo was originally called _______ in the United States.',
  FACT_391: 'A dentist legally changed his first name to _______ in order to attract more patients.',
  FACT_392: 'Under Marine Corps uniform regulations, a male marine may not carry a _______ while in uniform.',
  FACT_393: 'In the 1990s, a tobacco company sold cigarettes under the brand name _______.',
  FACT_394: 'A company sells patented synthetic testicles for neutered pets under the brand name _______.',
  FACT_395: 'Dr. Francis Fesmire discovered that the most reliable cure for hiccups is a _______.',
  FACT_396: "Wilma Flintstone's maiden name is _______.",
  FACT_397: 'The strings of symbols used to represent swearing in comic strips are called a _______.',
  FACT_398: 'Jim Henson originally planned to call Fraggle Rock _______.',
  FACT_399: "In 2014, teachers at a school in England were banned from using _______ to mark students' work.",
  FACT_400: "The Michelin Man's official name is _______.",
  FACT_401: 'In 1990, former first lady Barbara Bush wrote an official apology letter to _______.',
  FACT_402: "McDonald's once tested a grilled pineapple sandwich called the _______, which lost a sales contest to the Filet-O-Fish.",
  FACT_403: "The Rhode Island School of Design's hockey mascot is a phallic shape named _______.",
  FACT_404: 'In South Africa, traffic lights are commonly called _______.',
  FACT_405: 'Harry Houdini once publicly threatened to shoot all _______.',
  FACT_406: "Donald Duck's full middle name is _______.",
  FACT_407: "Michael J. Fox's actual middle name is _______.",
  FACT_408: "The world's strongest beer, brewed at 65% alcohol by volume, is called _______.",
  FACT_409: 'Wombats produce _______ shaped droppings, making them unique in the animal kingdom.',
  FACT_410: 'Before becoming a tech giant, Samsung originally started as a company that sold _______.',
  FACT_411: "Dr. Seuss coined the term _______ in his 1950 children's book.",
  FACT_412: 'A novelty company sells a product modeled after Queen Elizabeth II called _______.',
  FACT_413: 'The first chimpanzee sent into space was named _______.',
  FACT_414: 'According to U.S. occupational data, the profession with the highest proportion of white workers is _______.',
  FACT_415: "Miley Cyrus's legal first name is _______.",
  FACT_416: 'The fastest-growing baby name for girls in 2012 was _______.',
  FACT_417: 'There is a company called _______ that manufactures bullet-resistant groin protectors.',
  FACT_418: "Cap'n Crunch's official first name is _______.",
  FACT_419: 'According to the 2000 U.S. Census, the occupation with the highest divorce rate is _______.',
  FACT_420: 'Q-tips were originally sold in 1926 under the name _______.',
  FACT_421: 'Kool-Aid was originally sold under the brand name _______.',
  FACT_422: 'In 1995, a company released a Kermit the Frog-inspired cologne called _______.',
  FACT_423: 'The search engine that became Google was originally called _______.',
  FACT_424: "The Oxford Dictionaries' word of the year for 2013 was _______.",
  FACT_425: 'In the UK, the dance Americans call the Hokey Pokey is known as the _______.',
  FACT_426: "The winner of the 2012 World's Ugliest Dog Competition was named _______.",
  FACT_427: 'A company sells an underwear insert that neutralizes flatulence odors, marketed as _______.',
  FACT_428: 'An Indian stuntman who attempted to cross a river on a zip-line attached to his ponytail died of a _______.',
  FACT_429: 'When Milton Bradley acquired the rights to Twister, the game was originally called _______.',
  FACT_430: "Teamsters union leader Jimmy Hoffa's unusual middle name was _______.",
  FACT_431: 'A toy line featuring criminal characters with names like Dickie the Dealer is sold under the brand name _______.',
};

let changed = 0;
const updated = facts.map(f => {
  if (fixes[f.content_id]) {
    changed++;
    return { ...f, fact_template: fixes[f.content_id] };
  }
  return f;
});

// Verify all fixed entries have _______
const missing = updated.filter(f => !f.fact_template.includes('_______'));
if (missing.length > 0) {
  console.error('ERROR - entries still missing blank:', missing.map(f => f.content_id).join(', '));
  process.exit(1);
}

fs.writeFileSync('C:/Git/bluffalo/content/facts.json', JSON.stringify(updated, null, 2));
console.log('Fixed:', changed, 'entries. Total:', updated.length, '| All have blanks: true');
