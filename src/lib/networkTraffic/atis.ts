/** Readings off an ATIS broadcast's text, the same for both networks. */

const NATO: Record<string, string> = {
  ALPHA: 'A',
  ALFA: 'A',
  BRAVO: 'B',
  CHARLIE: 'C',
  DELTA: 'D',
  ECHO: 'E',
  FOXTROT: 'F',
  GOLF: 'G',
  HOTEL: 'H',
  INDIA: 'I',
  JULIET: 'J',
  JULIETT: 'J',
  KILO: 'K',
  LIMA: 'L',
  MIKE: 'M',
  NOVEMBER: 'N',
  OSCAR: 'O',
  PAPA: 'P',
  QUEBEC: 'Q',
  ROMEO: 'R',
  SIERRA: 'S',
  TANGO: 'T',
  UNIFORM: 'U',
  VICTOR: 'V',
  WHISKEY: 'W',
  XRAY: 'X',
  YANKEE: 'Y',
  ZULU: 'Z',
};

/** "INFORMATION K", "INFO K", "ATIS K" and the spelled "INFORMATION KILO" → "K". */
export function atisLetterFromText(lines: string[]): string | null {
  const text = lines.join(' ').toUpperCase();
  const m =
    text.match(/\bINFO(?:RMATION)?\s+([A-Z])\b/) ??
    text.match(/\bATIS\s+(?:INFO\s+)?([A-Z])\b/) ??
    text.match(/\bINFO(?:RMATION)?\s+([A-Z]{4,8})\b/);
  const found = m?.[1];
  if (!found) return null;
  return found.length === 1 ? found : (NATO[found] ?? null);
}

/** IVAO's first ATIS line is the voice server address, not part of the broadcast. */
export function broadcastLines(lines: string[]): string[] {
  return lines.filter((l) => !/^[\w.-]+\.ivao\.aero\//i.test(l.trim()));
}

/** Runways named in the broadcast: "RWY 25L", "RUNWAY 07", "RY 18". */
export function atisRunways(lines: string[]): string[] {
  const text = lines.join(' ');
  const pattern = /R(?:WY?|Y|UNWAYS?)\s*(\d{1,2}[LRC]?)/gi;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m[1]) found.add(m[1].toUpperCase());
  }
  return [...found];
}
