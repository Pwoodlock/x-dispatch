import { describe, expect, it } from 'vitest';
import { aircraftCopyLabels, aircraftFolder } from './aircraftStudio';

describe('aircraftFolder', () => {
  it('is the folder that holds the .acf', () => {
    expect(aircraftFolder('Aircraft/V12/Airbus A340 X-Works Mod/A330.acf')).toBe(
      'Airbus A340 X-Works Mod'
    );
  });

  it('reads Windows separators too', () => {
    expect(aircraftFolder('Aircraft\\Laminar Research\\Airbus A330\\A330.acf')).toBe('Airbus A330');
  });

  it('is empty for a bare file name', () => {
    expect(aircraftFolder('A330.acf')).toBe('');
  });
});

describe('aircraftCopyLabels', () => {
  const ac = (name: string, path: string) => ({ name, path });

  it('labels copies in different folders by folder', () => {
    const labels = aircraftCopyLabels([
      ac('Airbus A330-300', 'Aircraft/Laminar Research/Airbus A330/A330.acf'),
      ac('Airbus A330-300', 'Aircraft/V12/Airbus A340 X-Works Mod/A330.acf'),
      ac('Boeing 737-800', 'Aircraft/Laminar Research/Boeing 737-800/b738.acf'),
    ]);
    expect(Object.fromEntries(labels)).toEqual({
      'Aircraft/Laminar Research/Airbus A330/A330.acf': 'Airbus A330',
      'Aircraft/V12/Airbus A340 X-Works Mod/A330.acf': 'Airbus A340 X-Works Mod',
    });
  });

  it('labels variants in one folder by file', () => {
    const labels = aircraftCopyLabels([
      ac('Robinson R22 Beta II', 'Aircraft/LR/Robinson R22 Beta II/Robinson R22 Beta II.acf'),
      ac(
        'Robinson R22 Beta II',
        'Aircraft/LR/Robinson R22 Beta II/Robinson R22 Beta II_mariner.acf'
      ),
    ]);
    expect([...labels.values()]).toEqual([
      'Robinson R22 Beta II.acf',
      'Robinson R22 Beta II_mariner.acf',
    ]);
  });

  it('falls back to the path inside Aircraft when neither alone differs', () => {
    const labels = aircraftCopyLabels([
      ac('X', 'Aircraft/A/Same/x.acf'),
      ac('X', 'Aircraft/A/Same/y.acf'),
      ac('X', 'Aircraft/B/Same/x.acf'),
    ]);
    expect([...labels.values()]).toEqual(['A/Same/x.acf', 'A/Same/y.acf', 'B/Same/x.acf']);
  });

  it('leaves aircraft with a unique name unlabelled', () => {
    expect(
      aircraftCopyLabels([ac('A', 'Aircraft/A/a.acf'), ac('B', 'Aircraft/B/b.acf')]).size
    ).toBe(0);
  });
});
