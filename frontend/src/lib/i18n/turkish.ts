/**
 * Turkish case endings for numbers written as digits. The ending follows how the number is
 * read aloud: "%16" is "yüzde on altı", so it takes "%16'sında", while "%40" (kırk) takes
 * "%40'ında". A fixed suffix in a template is wrong for most values.
 */

const UNITS = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];

/** The last word spoken when reading a whole number. */
export function lastSpokenWord(value: number): string {
  const n = Math.abs(Math.trunc(value));
  if (n === 0) return "sıfır";
  if (n % 10 !== 0) return UNITS[n % 10] ?? "";
  if (n % 100 !== 0) return TENS[(n % 100) / 10] ?? "";
  if (n % 1000 !== 0) return "yüz";
  if (n % 1_000_000 !== 0) return "bin";
  if (n % 1_000_000_000 !== 0) return "milyon";
  return "milyar";
}

/**
 * The word a written number ends on: "18:00" is read as the hour, "12,5" ends on the decimals,
 * "%1.234" on the integer. Text without digits is returned as it is.
 */
export function spokenTail(text: string): string {
  const time = /(\d{1,2}):(\d{2})\s*$/.exec(text);
  if (time) {
    return lastSpokenWord(Number(time[2]) === 0 ? Number(time[1]) : Number(time[2]));
  }
  const number = /(\d[\d.]*)(?:,(\d+))?\D*$/.exec(text);
  if (!number) {
    return text;
  }
  if (number[2] !== undefined) {
    return lastSpokenWord(Number(number[2]));
  }
  return lastSpokenWord(Number((number[1] ?? "0").replace(/\./g, "")));
}

const VOWELS = "aeıioöuü";
const HARD = "çfhkpsşt";

function lastVowel(word: string): string {
  for (const letter of [...word].reverse()) {
    if (VOWELS.includes(letter)) {
      return letter;
    }
  }
  return "e";
}

const twoWay = (vowel: string) => ("eiöü".includes(vowel) ? "e" : "a");

function fourWay(vowel: string): string {
  if (vowel === "a" || vowel === "ı") return "ı";
  if (vowel === "e" || vowel === "i") return "i";
  if (vowel === "o" || vowel === "u") return "u";
  return "ü";
}

export type TurkishCase =
  /** -de/-da/-te/-ta: "18:00'de", "2026'da" */
  | "locative"
  /** -den/-dan/-ten/-tan: "12,5'ten" */
  | "ablative"
  /** -e/-a/-ye/-ya: "13,4'e", "2024'e" */
  | "dative"
  /** -i/-ı/-si/-sı: "hücrelerin %40'ı", "ayın 6'sı" */
  | "possessive"
  /** -inde/-sında: "akşamların %16'sında" */
  | "possessiveLocative"
  /** -ine/-sına: "gece hızının %60'ına" */
  | "possessiveDative";

/** The ending alone, without the apostrophe. */
export function turkishEnding(text: string, kind: TurkishCase): string {
  const word = spokenTail(text);
  const last = word[word.length - 1] ?? "e";
  const endsInVowel = VOWELS.includes(last);
  const vowel = lastVowel(word);
  const a = twoWay(vowel);
  const i = fourWay(vowel);
  const d = HARD.includes(last) ? "t" : "d";
  const possessive = (endsInVowel ? "s" : "") + i;

  switch (kind) {
    case "locative":
      return `${d}${a}`;
    case "ablative":
      return `${d}${a}n`;
    case "dative":
      return `${endsInVowel ? "y" : ""}${a}`;
    case "possessive":
      return possessive;
    case "possessiveLocative":
      return `${possessive}nd${a}`;
    case "possessiveDative":
      return `${possessive}n${a}`;
  }
}

/** The written number with its Turkish ending: suffix("%16", "possessiveLocative") is "%16'sında". */
export function suffix(value: string | number, kind: TurkishCase): string {
  const text = String(value);
  return `${text}'${turkishEnding(text, kind)}`;
}
