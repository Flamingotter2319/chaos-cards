// ══════════════════════════════════════════════════════════
//  UNDERTALE BATTLE ENGINE
//  Required by server.js
// ══════════════════════════════════════════════════════════

// ── ITEMS ─────────────────────────────────────────────────
const ITEMS = {
  // Healing
  monster_candy:  { id:'monster_candy',  name:'Monster Candy',   icon:'🍬', type:'heal', hpRestore:20,  goldCost:10,  desc:'Restores 20 HP.' },
  bandage:        { id:'bandage',        name:'Bandage',         icon:'🩹', type:'heal', hpRestore:30,  goldCost:20,  desc:'Restores 30 HP.' },
  bisicle:        { id:'bisicle',        name:'Bisicle',         icon:'🧊', type:'heal', hpRestore:11,  goldCost:7,   desc:'Restores 11 HP.' },
  nice_cream:     { id:'nice_cream',     name:'Nice Cream',      icon:'🍦', type:'heal', hpRestore:15,  goldCost:15,  desc:'Restores 15 HP.' },
  steak:          { id:'steak',          name:'Steak in the Shape of Mettaton',icon:'🥩',type:'heal',hpRestore:90,goldCost:100,desc:'Restores 90 HP.' },
  butterscotch:   { id:'butterscotch',   name:'Butterscotch Pie',icon:'🥧', type:'heal', hpRestore:99,  goldCost:150, desc:'Restores 99 HP. Baked with love.' },
  // Armor
  faded_ribbon:   { id:'faded_ribbon',   name:'Faded Ribbon',    icon:'🎀', type:'armor', defense:3,    goldCost:50,  desc:'+3 Defense.' },
  manly_bandanna: { id:'manly_bandanna', name:'Manly Bandanna',  icon:'🏴', type:'armor', defense:7,    goldCost:100, desc:'+7 Defense.' },
  cloudy_glasses: { id:'cloudy_glasses', name:'Cloudy Glasses',  icon:'🕶️', type:'armor', defense:12,   goldCost:200, desc:'+12 Defense.' },
  temmie_armor:   { id:'temmie_armor',   name:'Temmie Armor',    icon:'✨', type:'armor', defense:20,   goldCost:400, desc:'+20 Defense. hOI!' },
  // Weapons
  stick:          { id:'stick',          name:'Stick',           icon:'🪵', type:'weapon', attack:5,    goldCost:0,   desc:'+5 Attack. A basic stick.' },
  toy_knife:      { id:'toy_knife',      name:'Toy Knife',       icon:'🔪', type:'weapon', attack:10,   goldCost:50,  desc:'+10 Attack.' },
  tough_glove:    { id:'tough_glove',    name:'Tough Glove',     icon:'🥊', type:'weapon', attack:15,   goldCost:120, desc:'+15 Attack.' },
  ballet_shoes:   { id:'ballet_shoes',   name:'Ballet Shoes',    icon:'🩰', type:'weapon', attack:22,   goldCost:200, desc:'+22 Attack.' },
  empty_gun:      { id:'empty_gun',      name:'Empty Gun',       icon:'🔫', type:'weapon', attack:35,   goldCost:350, desc:'+35 Attack. No ammo.' },
  torn_notebook:  { id:'torn_notebook',  name:'Torn Notebook',   icon:'📓', type:'weapon', attack:40,   goldCost:420, desc:'+40 Attack. Still powerful.' },
  // Special
  snowman_piece:  { id:'snowman_piece',  name:"Snowman's Piece", icon:'⛄', type:'special', hpRestore:45, goldCost:0, desc:'Please take good care of it. Restores 45 HP.' },
};

// ── SHOP STOCK ─────────────────────────────────────────────
const SHOP_ITEMS = [
  ITEMS.monster_candy, ITEMS.bandage, ITEMS.bisicle, ITEMS.nice_cream,
  ITEMS.steak, ITEMS.butterscotch,
  ITEMS.faded_ribbon, ITEMS.manly_bandanna, ITEMS.cloudy_glasses, ITEMS.temmie_armor,
  ITEMS.stick, ITEMS.toy_knife, ITEMS.tough_glove, ITEMS.ballet_shoes,
  ITEMS.empty_gun, ITEMS.torn_notebook,
];

// Gold conversion: 1 chip = 5 gold
const CHIPS_TO_GOLD = 5;

// ── ENEMY / BOSS DEFINITIONS ───────────────────────────────
// attackPatterns: array of attack descriptors
// Each attack: { name, type, damage, desc, pattern }
// pattern: 'bullets' | 'rain' | 'walls' | 'spiral' | 'cross' | 'laser' | 'random'
// count: number of projectiles
// speed: 1–5
// duration: ms

const ENEMIES = [
  // ── REGULAR ENEMIES (20) ──────────────────────────────────
  {
    id:'froggit', name:'Froggit', icon:'🐸', hp:34, maxHp:34, atk:5, def:2, xp:5, gold:3,
    desc:'A small frog monster. Seems confused.',
    flavorTexts:['Froggit used Jumping Strike!','Froggit ribbits menacingly.','Froggit is hopping mad!'],
    acts:['Talk','Compliment','Ignore'],
    actEffects:{Talk:'Froggit is flattered.',Compliment:'Froggit became a little kinder.',Ignore:'Froggit looks hurt.'},
    mercy:['Compliment'],
    attackPatterns:[
      {name:'Jumping Bullets',type:'bullets',count:4,speed:2,duration:3000,damage:5,desc:'Bullets hop across the box.'},
    ],
    drops:[{item:'monster_candy',chance:0.3}],
  },
  {
    id:'whimsun', name:'Whimsun', icon:'🦋', hp:23, maxHp:23, atk:4, def:0, xp:4, gold:2,
    desc:'A timid butterfly monster. Very delicate.',
    flavorTexts:['Whimsun trembles!','Whimsun flutters nervously.'],
    acts:['Comfort','Scare'],
    actEffects:{Comfort:'Whimsun calmed down.',Scare:'Whimsun panics! Impossible to flee!'},
    mercy:['Comfort'],
    attackPatterns:[
      {name:'Flutter Dust',type:'random',count:5,speed:1,duration:2500,damage:3,desc:'Glittery dust rains down.'},
    ],
    drops:[{item:'bandage',chance:0.2}],
  },
  {
    id:'moldsmal', name:'Moldsmal', icon:'🟢', hp:44, maxHp:44, atk:6, def:3, xp:6, gold:4,
    desc:'A jiggly blob. Doesn\'t seem very smart.',
    flavorTexts:['Moldsmal wiggles!','Moldsmal does the worm.'],
    acts:['Imitate','Dance','Spare'],
    actEffects:{Imitate:'Moldsmal copies you.',Dance:'Moldsmal dances!',Spare:'...'},
    mercy:['Imitate','Dance'],
    attackPatterns:[
      {name:'Blob Bounce',type:'bullets',count:3,speed:2,duration:3000,damage:6,desc:'Blobs bounce around.'},
      {name:'Jiggle Wave',type:'walls',count:2,speed:2,duration:3500,damage:5,desc:'Walls of goop slide in.'},
    ],
    drops:[{item:'bisicle',chance:0.25}],
  },
  {
    id:'loox', name:'Loox', icon:'👁️', hp:58, maxHp:58, atk:8, def:4, xp:7, gold:5,
    desc:'A bully. Don\'t pick on it.',
    flavorTexts:['Loox is staring you down!','Loox flexes menacingly.'],
    acts:['Pick On','Don\'t Pick On'],
    actEffects:{'Pick On':'Bad idea.','Don\'t Pick On':'Loox is shocked — it doesn\'t know how to react.'},
    mercy:['Don\'t Pick On'],
    attackPatterns:[
      {name:'Eye Beam',type:'laser',count:1,speed:3,duration:2000,damage:9,desc:'A burning laser sweeps the box.'},
      {name:'Stare',type:'bullets',count:6,speed:2,duration:3000,damage:7,desc:'Bullets aimed straight at you.'},
    ],
    drops:[{item:'faded_ribbon',chance:0.2}],
  },
  {
    id:'vegetoid', name:'Vegetoid', icon:'🥦', hp:54, maxHp:54, atk:7, def:3, xp:7, gold:4,
    desc:'A vegetable monster. Wants you to eat your greens.',
    flavorTexts:['Vegetoid used Consume!','Vegetoid offers you some greens.'],
    acts:['Eat','Flirt'],
    actEffects:{Eat:'You ate the Vegetoid. +HP restored.',Flirt:'Vegetoid turns red.'},
    mercy:['Eat'],
    attackPatterns:[
      {name:'Veggie Rain',type:'rain',count:8,speed:2,duration:3500,damage:6,desc:'Vegetables fall from above.'},
    ],
    drops:[{item:'nice_cream',chance:0.3}],
  },
  {
    id:'snowdrake', name:'Snowdrake', icon:'🐉', hp:60, maxHp:60, atk:9, def:4, xp:8, gold:6,
    desc:'A dragon that makes snow puns.',
    flavorTexts:['Snowdrake used Ice Breath!','Snowdrake tried to make a pun.'],
    acts:['Laugh','Ignore'],
    actEffects:{Laugh:'Snowdrake is encouraged.',Ignore:'Snowdrake is upset.'},
    mercy:['Laugh'],
    attackPatterns:[
      {name:'Ice Breath',type:'walls',count:3,speed:3,duration:3000,damage:8,desc:'Icy walls slide in from the side.'},
      {name:'Snow Shower',type:'rain',count:10,speed:2,duration:4000,damage:6,desc:'Snow falls rapidly.'},
    ],
    drops:[{item:'bisicle',chance:0.35}],
  },
  {
    id:'chilldrake', name:'Chilldrake', icon:'❄️', hp:65, maxHp:65, atk:10, def:5, xp:9, gold:7,
    desc:'Snowdrake\'s cooler cousin.',
    flavorTexts:['Chilldrake exhales frosty air.','Chilldrake is too cool for this.'],
    acts:['Hug','Chill'],
    actEffects:{Hug:'Chilldrake warms up.',Chill:'You bond over being chill.'},
    mercy:['Hug','Chill'],
    attackPatterns:[
      {name:'Blizzard',type:'spiral',count:12,speed:3,duration:4000,damage:9,desc:'Bullets spiral inward.'},
      {name:'Frost Wave',type:'walls',count:2,speed:4,duration:2500,damage:11,desc:'Fast frost walls.'},
    ],
    drops:[{item:'nice_cream',chance:0.25}],
  },
  {
    id:'icecap', name:'Ice Cap', icon:'🎩', hp:72, maxHp:72, atk:11, def:6, xp:10, gold:8,
    desc:'A magical hat... with a face. Kind of',
    flavorTexts:['Ice Cap adjusts itself.','Ice Cap spins ominously.'],
    acts:['Steal Hat','Don\'t Steal Hat'],
    actEffects:{'Steal Hat':'Ice Cap is furious!','Don\'t Steal Hat':'Ice Cap is grateful.'},
    mercy:['Don\'t Steal Hat'],
    attackPatterns:[
      {name:'Hat Toss',type:'bullets',count:5,speed:3,duration:3500,damage:10,desc:'Hats spin across the arena.'},
      {name:'Blizzard',type:'spiral',count:8,speed:3,duration:3500,damage:9,desc:'Icy spiral attack.'},
    ],
    drops:[{item:'manly_bandanna',chance:0.15}],
  },
  {
    id:'gyftrot', name:'Gyftrot', icon:'🦌', hp:86, maxHp:86, atk:13, def:7, xp:11, gold:10,
    desc:'Covered in horrible decorations. Please remove them.',
    flavorTexts:['Gyftrot rattles its ornaments!','Gyftrot looks burdened.'],
    acts:['Remove Decorations','Ignore'],
    actEffects:{'Remove Decorations':'Gyftrot feels lighter! Attack reduced.','Ignore':'...'},
    mercy:['Remove Decorations'],
    attackPatterns:[
      {name:'Ornament Barrage',type:'random',count:14,speed:3,duration:4000,damage:12,desc:'Ornaments fly everywhere.'},
      {name:'Antler Charge',type:'laser',count:1,speed:4,duration:1500,damage:15,desc:'Charges in a straight line.'},
    ],
    drops:[{item:'nice_cream',chance:0.2},{item:'faded_ribbon',chance:0.1}],
  },
  {
    id:'doggo', name:'Doggo', icon:'🐕', hp:80, maxHp:80, atk:14, def:7, xp:12, gold:11,
    desc:'A dog who can only see moving things.',
    flavorTexts:['Doggo is sniffing the air.','Doggo used Fetch!'],
    acts:['Pet','Stay Still'],
    actEffects:{Pet:'Doggo is happy!','Stay Still':'Doggo can\'t see you! Confused.'},
    mercy:['Pet'],
    attackPatterns:[
      {name:'Fetch Attack',type:'bullets',count:6,speed:4,duration:3000,damage:13,desc:'Bullets chase movement.'},
    ],
    drops:[{item:'stick',chance:0.5}],
  },
  {
    id:'lesser_dog', name:'Lesser Dog', icon:'🐶', hp:90, maxHp:90, atk:15, def:8, xp:13, gold:12,
    desc:'A dog guard. Neck extends infinitely when petted.',
    flavorTexts:['Lesser Dog used Tackle!','Lesser Dog wags enthusiastically.'],
    acts:['Pet','Pet Again','Pet More'],
    actEffects:{Pet:'Dog is happy.',PetAgain:'Dog is happier.',PetMore:'Dog is ecstatic!'},
    mercy:['Pet','Pet Again','Pet More'],
    attackPatterns:[
      {name:'Tail Whip',type:'bullets',count:7,speed:3,duration:3500,damage:14,desc:'Bullets swing side to side.'},
      {name:'Leap',type:'random',count:5,speed:4,duration:3000,damage:13,desc:'Random bounding attacks.'},
    ],
    drops:[{item:'stick',chance:0.3},{item:'bandage',chance:0.15}],
  },
  {
    id:'greater_dog', name:'Greater Dog', icon:'🐾', hp:105, maxHp:105, atk:17, def:10, xp:15, gold:14,
    desc:'The largest and most powerful dog guard.',
    flavorTexts:['Greater Dog barks!','Greater Dog does a flip!'],
    acts:['Play','Call Cute'],
    actEffects:{Play:'Greater Dog is delighted!','Call Cute':'Greater Dog blushes.'},
    mercy:['Play','Call Cute'],
    attackPatterns:[
      {name:'Armor Slam',type:'walls',count:4,speed:4,duration:3000,damage:16,desc:'Armor pieces crash in.'},
      {name:'Bone Throw',type:'rain',count:12,speed:3,duration:4000,damage:14,desc:'Bones rain from above.'},
    ],
    drops:[{item:'manly_bandanna',chance:0.2},{item:'toy_knife',chance:0.15}],
  },
  {
    id:'royal_guard1', name:'Royal Guard 01', icon:'⚔️', hp:120, maxHp:120, atk:18, def:11, xp:16, gold:15,
    desc:'An elite guard. Loves cleaning armor.',
    flavorTexts:['Royal Guard 01 lunges!','Royal Guard 01 polishes their armor.'],
    acts:['Beckon','Whisper to RG02'],
    actEffects:{Beckon:'RG01 approaches.',  'Whisper to RG02':'RG01 blushes and lowers weapon.'},
    mercy:['Whisper to RG02'],
    attackPatterns:[
      {name:'Spear Thrust',type:'laser',count:2,speed:4,duration:2500,damage:18,desc:'Two spears cross the arena.'},
      {name:'Shield Bash',type:'walls',count:3,speed:4,duration:3000,damage:15,desc:'Shield slides across the floor.'},
    ],
    drops:[{item:'tough_glove',chance:0.15},{item:'bandage',chance:0.25}],
  },
  {
    id:'royal_guard2', name:'Royal Guard 02', icon:'🛡️', hp:110, maxHp:110, atk:19, def:12, xp:16, gold:15,
    desc:'An elite guard. Loves their partner.',
    flavorTexts:['Royal Guard 02 attacks fiercely!'],
    acts:['Beckon','Whisper to RG01'],
    actEffects:{Beckon:'RG02 approaches.','Whisper to RG01':'RG02 blushes deeply.'},
    mercy:['Whisper to RG01'],
    attackPatterns:[
      {name:'Armor Rush',type:'spiral',count:10,speed:4,duration:3500,damage:17,desc:'Spinning armor shards.'},
      {name:'Dual Strike',type:'cross',count:2,speed:5,duration:2000,damage:20,desc:'Cross-shaped laser beams.'},
    ],
    drops:[{item:'tough_glove',chance:0.15}],
  },
  {
    id:'vulkin', name:'Vulkin', icon:'🌋', hp:95, maxHp:95, atk:16, def:9, xp:14, gold:13,
    desc:'A lava monster that wants to warm you up. Badly.',
    flavorTexts:['Vulkin erupts!','Vulkin is trying to help you. Somehow.'],
    acts:['Encourage'],
    actEffects:{Encourage:'Vulkin gets overexcited and explodes with joy.'},
    mercy:['Encourage'],
    attackPatterns:[
      {name:'Lava Rain',type:'rain',count:16,speed:3,duration:4500,damage:15,desc:'Lava drops fall fast.'},
      {name:'Eruption',type:'spiral',count:14,speed:4,duration:4000,damage:16,desc:'Lava spirals outward.'},
    ],
    drops:[{item:'nice_cream',chance:0.2},{item:'manly_bandanna',chance:0.1}],
  },
  {
    id:'tsunderplane', name:'Tsunderplane', icon:'✈️', hp:100, maxHp:100, atk:17, def:10, xp:15, gold:14,
    desc:'It\'s not like it wants you to dodge or anything!',
    flavorTexts:['Tsunderplane used Bomb Drop — not for you!','Tsunderplane tsundere-attacks.'],
    acts:['Approach','Ignore'],
    actEffects:{Approach:'Tsunderplane backs away nervously.',Ignore:'Tsunderplane is infuriated!'},
    mercy:['Approach'],
    attackPatterns:[
      {name:'Bomb Drop',type:'rain',count:12,speed:4,duration:4000,damage:15,desc:'Bombs fall in formation.'},
      {name:'Missile Barrage',type:'random',count:18,speed:4,duration:4500,damage:13,desc:'Missiles scatter everywhere.'},
    ],
    drops:[{item:'cloudy_glasses',chance:0.1},{item:'bandage',chance:0.2}],
  },
  {
    id:'mad_dummy', name:'Mad Dummy', icon:'🎭', hp:150, maxHp:150, atk:20, def:0, xp:18, gold:20,
    desc:'A training dummy that went insane. Normal attacks don\'t work!',
    flavorTexts:['Mad Dummy flails!','Mad Dummy summons more dummies!'],
    acts:['Talk','Insult'],
    actEffects:{Talk:'...','Insult':'Dummy rages!'},
    mercy:[],
    immuneToPhysical: true,
    attackPatterns:[
      {name:'Dummy Wave',type:'walls',count:5,speed:3,duration:4000,damage:18,desc:'Dummies fly in from sides.'},
      {name:'Cotton Storm',type:'random',count:20,speed:3,duration:5000,damage:15,desc:'Cotton stuffing everywhere.'},
    ],
    drops:[{item:'tough_glove',chance:0.2}],
  },
  {
    id:'knight_knight', name:'Knight Knight', icon:'🏰', hp:130, maxHp:130, atk:22, def:13, xp:20, gold:22,
    desc:'A sleepy knight. Attacks even while asleep.',
    flavorTexts:['Knight Knight murmurs in their sleep.','Knight Knight attacks reflexively!'],
    acts:['Lullaby','Hum'],
    actEffects:{Lullaby:'Knight Knight falls asleep. Attack lowered.',Hum:'Knight Knight snores peacefully.'},
    mercy:['Lullaby','Hum'],
    attackPatterns:[
      {name:'Dream Slash',type:'cross',count:3,speed:4,duration:3000,damage:22,desc:'Slashes form a cross pattern.'},
      {name:'Sleep Bombs',type:'random',count:15,speed:3,duration:5000,damage:18,desc:'Dream bombs drift lazily.'},
    ],
    drops:[{item:'ballet_shoes',chance:0.15}],
  },
  {
    id:'madjick', name:'Madjick', icon:'🔮', hp:120, maxHp:120, atk:21, def:14, xp:19, gold:20,
    desc:'A powerful magic user.',
    flavorTexts:['Madjick casts a spell!','Madjick\'s orbs orbit menacingly.'],
    acts:['Talk','Stare at Orbs'],
    actEffects:{Talk:'Madjick is confused.','Stare at Orbs':'Orbs calm down.'},
    mercy:['Stare at Orbs'],
    attackPatterns:[
      {name:'Orb Spiral',type:'spiral',count:16,speed:4,duration:5000,damage:20,desc:'Magical orbs spiral around you.'},
      {name:'Magic Cross',type:'cross',count:4,speed:5,duration:2500,damage:24,desc:'Cross-shaped beams of magic.'},
    ],
    drops:[{item:'cloudy_glasses',chance:0.2},{item:'empty_gun',chance:0.05}],
  },
  {
    id:'final_froggit', name:'Final Froggit', icon:'🐸💀', hp:135, maxHp:135, atk:24, def:15, xp:22, gold:25,
    desc:'An ancient frog of immense power.',
    flavorTexts:['Final Froggit leaps menacingly!','Final Froggit speaks in an ancient tongue.'],
    acts:['Mystify','Compliment'],
    actEffects:{Mystify:'Final Froggit is bewildered.',Compliment:'Final Froggit is touched.'},
    mercy:['Mystify','Compliment'],
    attackPatterns:[
      {name:'Hypno-Bullets',type:'spiral',count:20,speed:5,duration:5000,damage:22,desc:'Hypnotic spiraling bullets.'},
      {name:'Ancient Rain',type:'rain',count:24,speed:5,duration:5000,damage:20,desc:'Ancient power rains down.'},
      {name:'Cross Beam',type:'cross',count:4,speed:5,duration:2000,damage:26,desc:'Four-way energy cross.'},
    ],
    drops:[{item:'torn_notebook',chance:0.1},{item:'empty_gun',chance:0.1}],
  },

  // ── BOSSES (5) ──────────────────────────────────────────
  {
    id:'toriel', name:'TORIEL', icon:'🐐', hp:440, maxHp:440, atk:8, def:9, xp:0, gold:50,
    isBoss:true,
    desc:'The caretaker of the Ruins. She won\'t let you leave.',
    flavorTexts:['Toriel used Fire!','Toriel looks saddened.','Toriel: "Please, do not make me do this."'],
    acts:['Talk','Appeal','Plead'],
    actEffects:{Talk:'Toriel looks pained.',Appeal:'Toriel hesitates.',Plead:'Toriel lowers her guard.'},
    mercy:['Plead'],
    attackPatterns:[
      {name:'Friendliness Pellets',type:'bullets',count:12,speed:3,duration:4000,damage:7,desc:'Fireballs that don\'t want to hurt you.'},
      {name:'Ring of Fire',type:'spiral',count:18,speed:3,duration:5000,damage:8,desc:'A ring of fire expands.'},
      {name:'Flame Cross',type:'cross',count:2,speed:4,duration:3000,damage:10,desc:'Columns of fire.'},
    ],
    drops:[{item:'butterscotch',chance:1},{item:'faded_ribbon',chance:1}],
  },
  {
    id:'papyrus', name:'PAPYRUS', icon:'💀', hp:680, maxHp:680, atk:13, def:12, xp:0, gold:80,
    isBoss:true,
    desc:'The Great Papyrus! He wants to capture a human.',
    flavorTexts:['PAPYRUS: "NYEH HEH HEH!"','PAPYRUS used Blue Attack!','PAPYRUS: "YOU CANNOT GRASP THE TRUE FORM OF PAPYRUS\'S ATTACK!"'],
    acts:['Flirt','Flex','Surrender'],
    actEffects:{Flirt:'Papyrus becomes flustered. NYEH?!',Flex:'Papyrus flexes back.',Surrender:'Papyrus is confused by your strategy.'},
    mercy:['Flirt','Surrender'],
    attackPatterns:[
      {name:'Blue Bones',type:'bullets',count:14,speed:3,duration:5000,damage:12,desc:'Blue bones — stop moving!'},
      {name:'Bone Wall',type:'walls',count:4,speed:4,duration:4000,damage:14,desc:'Walls of bones.'},
      {name:'Special Attack',type:'spiral',count:22,speed:4,duration:5500,damage:13,desc:'The GREAT PAPYRUS\'s special attack!'},
    ],
    drops:[{item:'manly_bandanna',chance:1},{item:'nice_cream',chance:1}],
  },
  {
    id:'undyne', name:'UNDYNE', icon:'🐟', hp:1500, maxHp:1500, atk:20, def:14, xp:0, gold:150,
    isBoss:true,
    desc:'The head of the Royal Guard. Incredibly determined.',
    flavorTexts:['Undyne used Spear!','Undyne: "I\'ll defeat you for the good of the underground!"','Undyne laughs with burning determination.'],
    acts:['Taunt','Struggle','Praise'],
    actEffects:{Taunt:'Undyne attacks harder!',Struggle:'Undyne respects your determination.',Praise:'Undyne is briefly caught off guard.'},
    mercy:['Praise'],
    attackPatterns:[
      {name:'Spear Rain',type:'rain',count:20,speed:5,duration:5000,damage:18,desc:'Spears rain from the ceiling.'},
      {name:'Green Spears',type:'walls',count:5,speed:5,duration:4500,damage:22,desc:'Green mode — you must BLOCK!'},
      {name:'Arrow Barrage',type:'spiral',count:24,speed:5,duration:5500,damage:20,desc:'Endless arrow spiral.'},
      {name:'Spear Cross',type:'cross',count:6,speed:5,duration:3000,damage:25,desc:'Spear crosses from all directions.'},
    ],
    drops:[{item:'tough_glove',chance:1},{item:'nice_cream',chance:1}],
  },
  {
    id:'mettaton', name:'METTATON EX', icon:'🤖', hp:2000, maxHp:2000, atk:23, def:16, xp:0, gold:200,
    isBoss:true,
    desc:'The beautiful robot superstar... in his EX form!',
    flavorTexts:['Mettaton poses dramatically!','Mettaton: "RATINGS!!!"','Mettaton fires his arm cannon!'],
    acts:['Pose','Compliment','Attack His Legs'],
    actEffects:{Pose:'Ratings go up! Attack lowered.',Compliment:'Ratings surge! Mettaton blows a kiss.','Attack His Legs':'Mettaton is destabilized.'},
    mercy:['Pose','Compliment'],
    attackPatterns:[
      {name:'Arm Cannon',type:'laser',count:3,speed:5,duration:3000,damage:22,desc:'Laser sweeps the arena.'},
      {name:'Heart Barrage',type:'random',count:25,speed:4,duration:5000,damage:20,desc:'Heart projectiles everywhere.'},
      {name:'Spotlight',type:'cross',count:6,speed:5,duration:3500,damage:24,desc:'Spotlight beams cross the arena.'},
      {name:'Neo Finale',type:'spiral',count:30,speed:5,duration:6000,damage:23,desc:'The ultimate spiral attack!'},
    ],
    drops:[{item:'ballet_shoes',chance:1},{item:'torn_notebook',chance:1}],
  },
  {
    id:'asgore', name:'ASGORE', icon:'👑', hp:3500, maxHp:3500, atk:30, def:20, xp:0, gold:400,
    isBoss:true,
    desc:'The King of Monsters. He has no choice but to fight.',
    flavorTexts:['Asgore used Flame!','Asgore attacks with a sorrowful heart.','Asgore: "Do you really think you can win?"'],
    acts:['Talk','Ask About Toriel','Spare'],
    actEffects:{Talk:'Asgore looks pained.',  'Ask About Toriel':'Asgore falters.',Spare:'Asgore hesitates.'},
    mercy:['Ask About Toriel'],
    attackPatterns:[
      {name:'Trident of Heaven',type:'rain',count:28,speed:5,duration:5500,damage:28,desc:'Tridents rain from above.'},
      {name:'Ring of Flames',type:'spiral',count:32,speed:5,duration:6000,damage:26,desc:'Rings of fire expand outward.'},
      {name:'Royal Cross',type:'cross',count:8,speed:5,duration:3500,damage:32,desc:'Cross-shaped fire columns.'},
      {name:'Final Flame',type:'walls',count:6,speed:5,duration:5000,damage:30,desc:'Walls of royal fire close in.'},
    ],
    drops:[{item:'temmie_armor',chance:1},{item:'butterscotch',chance:1},{item:'empty_gun',chance:1}],
  },
];

// Boss appears every 5 regular kills
const BOSS_SEQUENCE = ['toriel','papyrus','undyne','mettaton','asgore'];

// ── PLAYER STATS ─────────────────────────────────────────────
function newPlayerStats(){
  return {
    level:1, xp:0, xpToNext:10,
    maxHp:20, hp:20,
    baseAtk:10, baseDef:10,
    gold:0,
    weapon:null, armor:null,
    inventory:[],  // max 8 items
    kills:0, bossKills:0,
    status:null, // 'poisoned','frozen' etc
  };
}

function getAtk(stats){ return stats.baseAtk + (ITEMS[stats.weapon]?.attack||0); }
function getDef(stats){ return stats.baseDef + (ITEMS[stats.armor]?.defense||0); }

function xpForLevel(lvl){ return Math.floor(10 * Math.pow(1.6, lvl-1)); }

function gainXP(stats, amount){
  const logs=[];
  stats.xp += amount;
  while(stats.xp >= stats.xpToNext){
    stats.xp -= stats.xpToNext;
    stats.level++;
    stats.xpToNext = xpForLevel(stats.level);
    stats.maxHp += 4;
    stats.hp = Math.min(stats.hp+4, stats.maxHp);
    stats.baseAtk += 2;
    stats.baseDef += 2;
    logs.push(`⬆️ Level up! Now LV ${stats.level}. HP +4, ATK +2, DEF +2.`);
  }
  return logs;
}

function calcDamage(atkStat, defStat, accuracy){
  // accuracy 0–1 scale
  const base = Math.max(1, atkStat - Math.floor(defStat / 2));
  const mult = 0.7 + (accuracy * 0.6); // 0.7x to 1.3x based on accuracy
  return Math.max(1, Math.round(base * mult));
}

// ── PVP CHALLENGE SYSTEM ────────────────────────────────────
const pvpChallenges = new Map(); // challengeId → {from, to, fromWs, accepted}
const pvpBattles = new Map();    // battleId → BattleState

function createPvpBattle(p1, p2, p1ws, p2ws){
  const bid = `pvp_${Date.now()}`;
  const battle = {
    id: bid,
    phase: 'p1_attack', // p1_attack | p2_dodge | p2_attack | p1_dodge | result
    p1: { ...p1, ws:p1ws, choice:null, accuracy:0 },
    p2: { ...p2, ws:p2ws, choice:null, accuracy:0 },
    turn: 1,
    log: [],
  };
  pvpBattles.set(bid, battle);
  return battle;
}

// ── ENEMY SELECTOR ──────────────────────────────────────────
function pickEnemy(killCount){
  // Every 5th kill is a boss
  if(killCount > 0 && killCount % 5 === 0){
    const bossIdx = Math.floor(killCount/5 - 1) % BOSS_SEQUENCE.length;
    return JSON.parse(JSON.stringify(ENEMIES.find(e=>e.id===BOSS_SEQUENCE[bossIdx]) || ENEMIES[0]));
  }
  // Scale difficulty: unlock harder enemies as kills increase
  const available = ENEMIES.filter(e=>!e.isBoss);
  const maxIdx = Math.min(available.length-1, Math.floor(killCount/2));
  const pool = available.slice(0, Math.min(maxIdx+3, available.length));
  const picked = pool[Math.floor(Math.random()*pool.length)];
  const clone = JSON.parse(JSON.stringify(picked));
  // Scale up slightly based on kills
  const scale = 1 + (killCount * 0.04);
  clone.hp = Math.round(clone.hp * scale);
  clone.maxHp = clone.hp;
  clone.atk = Math.round(clone.atk * scale);
  return clone;
}

// ── UNDERTALE SESSIONS ──────────────────────────────────────
// Sessions are per-player (solo PvE) or 1v1 (PvP)
const utSessions = new Map(); // username → UTSession

function getOrCreateSession(username){
  if(!utSessions.has(username)){
    const s = { username, stats:newPlayerStats(), enemy:pickEnemy(0), battlePhase:'idle', log:[] };
    utSessions.set(username, s);
  }
  return utSessions.get(username);
}

function sessionState(s){
  return {
    type:'utState',
    stats:{ ...s.stats, weapon:s.stats.weapon, armor:s.stats.armor, inventory:s.stats.inventory },
    enemy: s.enemy ? { id:s.enemy.id, name:s.enemy.name, icon:s.enemy.icon, hp:s.enemy.hp, maxHp:s.enemy.maxHp, atk:s.enemy.atk, def:s.enemy.def, isBoss:s.enemy.isBoss, desc:s.enemy.desc, flavorTexts:s.enemy.flavorTexts, acts:s.enemy.acts, attackPatterns:s.enemy.attackPatterns } : null,
    battlePhase: s.battlePhase,
    log: s.log.slice(-8),
  };
}

module.exports = {
  ENEMIES, ITEMS, SHOP_ITEMS, CHIPS_TO_GOLD,
  newPlayerStats, getAtk, getDef, gainXP, calcDamage,
  pickEnemy, getOrCreateSession, sessionState,
  pvpChallenges, pvpBattles, createPvpBattle, utSessions,
  xpForLevel,
};
