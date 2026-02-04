export const runningQuotes = [
  "The miracle isn't that I finished. The miracle is that I had the courage to start. - John Bingham",
  "Run when you can, walk if you have to, crawl if you must; just never give up. - Dean Karnazes",
  "The obsession with running is really an obsession with the potential for more and more life. - George Sheehan",
  "If you want to become the best runner you can be, start now. Don't spend the rest of your life wondering if you can do it. - Priscilla Welch",
  "It's not about how fast you run, it's about how far you go.",
  "Ask yourself: 'Can I give more?' The answer is usually: 'Yes.' - Paul Tergat",
  "You have a choice. You can throw in the towel, or you can use it to wipe the sweat off your face. - Gatorade",
  "The only one who can tell you 'you can't' is you. And you don't have to listen. - Nike",
  "We run, not because we think it is doing us good, but because we enjoy it and cannot help ourselves. - Roger Bannister",
  "Running is the greatest metaphor for life, because you get out of it what you put into it. - Oprah Winfrey",
  "A run begins the moment you forget you are running.",
  "The body achieves what the mind believes.",
  "The real purpose of running isn't to win a race. It's to test the limits of the human heart. - Bill Bowerman",
  "You would run much slower if you were dragging something behind you, like a knapsack or a sheriff. - Lemony Snicket",
  "Every morning in Africa, a gazelle wakes up knowing it must outrun the fastest lion or it will be killed. Every morning in Africa, a lion wakes up. It knows it must run faster than the slowest gazelle, or it will starve. It doesn't matter whether you're the lion or a gazelle - when the sun comes up, you'd better be running. - Christopher McDougall",
  "I often hear someone say I'm not a real runner. We are all runners, some just run faster than others. I never met a fake runner. - Bart Yasso",
  "Pain is temporary. Quitting lasts forever. - Lance Armstrong",
  "The miracle isn't that I finished. The miracle is that I had the courage to start.",
  "Running is nothing more than a series of arguments between the part of your brain that wants to stop and the part that wants to keep going.",
  "Whether you think you can or think you can't, you're right. - Henry Ford",
  "Your body will argue that there is no justifiable reason to continue. Your only recourse is to call on your spirit, which fortunately functions independently of logic. - Tim Noakes",
  "Motivation is what gets you started. Habit is what keeps you going. - Jim Ryun",
  "Don't dream of winning, train for it. - Mo Farah",
  "The will to win means nothing without the will to prepare. - Juma Ikangaa",
  "It's very hard in the beginning to understand that the whole idea is not to beat the other runners. Eventually you learn that the competition is against the little voice inside you that wants you to quit. - George Sheehan",
  "If you don't have answers to your problems after a four-hour run, you ain't getting them. - Christopher McDougall",
  "The hardest step is the first one out the door.",
  "Today I will do what others won't, so tomorrow I can accomplish what others can't. - Jerry Rice",
  "Run often. Run long. But never outrun your joy of running. - Julie Isphording",
  "We are different, in essence, from other men. If you want to win something, run 100 meters. If you want to experience something, run a marathon. - Emil Zatopek",
  "The finish line is just the beginning of a whole new race.",
  "Fast running isn't forced. You have to relax and let the run come out of you. - Desiree Linden",
  "Tough times don't last. Tough people do.",
  "Running allows me to set my mind free. Nothing seems impossible. Nothing unattainable. - Kara Goucher",
  "If you run, you are a runner. It doesn't matter how fast or how far. It doesn't matter if today is your first day or if you've been running for twenty years. There is no test to pass, no license to earn, no membership card to get. You just run. - John Bingham",
  "Good health, peace of mind, being outdoors, and camaraderie - those are all wonderful things that come to you when running. But for me, the real pull of running - the reason I run - is to experience a sense of personal freedom. - Jill Gaitenby",
  "Winning is great, sure, but if you are really going to do something in life, the secret is learning how to lose. Nobody goes undefeated all the time. - Wilma Rudolph",
  "I'm going to work so that it's a pure guts race at the end, and if it is, I am the only one who can win it. - Steve Prefontaine",
  "The difference between the mile and the marathon is the difference between burning your fingers with a match and being slowly roasted over hot coals. - Hal Higdon",
  "Mind is everything. Muscle - pieces of rubber. All that I am, I am because of my mind. - Paavo Nurmi",
  "Racing teaches us to challenge ourselves. It teaches us to push beyond where we thought we could go. It helps us to find out what we are made of. - PattiSue Plumer",
  "There are clubs you can't belong to, neighborhoods you can't live in, schools you can't get into, but the roads are always open. - Nike",
  "I don't run to add days to my life, I run to add life to my days.",
  "Run like there's a hot guy in front of you and a creepy one behind you.",
  "The footing was really atrocious. I loved it. I really like cross country; you're one with the mud. - Lynn Jennings",
  "Most people never run far enough on their first wind to find out they've got a second. - William James",
  "Life is short... running makes it seem longer. - Baron Hansen",
  "You didn't beat me. You merely finished in front of me. - Hal Higdon",
  "Don't bother just to be better than your contemporaries or predecessors. Try to be better than yourself. - William Faulkner",
  "Running is a big question mark that's there each and every day. It asks you, 'Are you going to be a wimp or are you going to be strong today?' - Peter Maher",
  "Believe in yourself and all that you are. Know that there is something inside you that is greater than any obstacle. - Christian D. Larson",
  "The man who can drive himself further once the effort gets painful is the man who will win. - Roger Bannister",
  "I always loved running... it was something you could do by yourself, and under your own power. You could go in any direction, fast or slow as you wanted, fighting the wind if you felt like it, seeking out new sights just on the strength of your feet and the courage of your lungs. - Jesse Owens",
  "Run in the morning, lift in the evening, eat like a champion.",
  "Be the damn penguin.",
];

const QUOTE_REFRESH_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

export function getRunningQuote(): string {
  const now = Date.now();
  const storedData = localStorage.getItem('runningQuote');

  if (storedData) {
    const { quote, timestamp } = JSON.parse(storedData);

    // If less than 3 hours have passed, return the stored quote
    if (now - timestamp < QUOTE_REFRESH_INTERVAL) {
      return quote;
    }
  }

  // Generate a new random quote
  const randomIndex = Math.floor(Math.random() * runningQuotes.length);
  const newQuote = runningQuotes[randomIndex];

  // Store the quote with current timestamp
  localStorage.setItem('runningQuote', JSON.stringify({
    quote: newQuote,
    timestamp: now,
  }));

  return newQuote;
}
