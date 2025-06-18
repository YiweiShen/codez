import { parseEnvInput } from '../../../src/config/config';

describe('parseEnvInput', () => {
  it('returns empty object for empty input', () => {
    expect(parseEnvInput('')).toEqual({});
  });

  it('parses comma-separated key=value pairs', () => {
    expect(parseEnvInput('VAR1=value1,VAR2=value2')).toEqual({
      VAR1: 'value1',
      VAR2: 'value2',
    });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseEnvInput('VAR1 = value1 , VAR2= value2 ')).toEqual({
      VAR1: 'value1',
      VAR2: 'value2',
    });
  });

  it('parses multiline YAML mapping', () => {
    const input = `
VAR1: value1
VAR2: "value2"
VAR3: 'value3'
`;
    expect(parseEnvInput(input)).toEqual({
      VAR1: 'value1',
      VAR2: 'value2',
      VAR3: 'value3',
    });
  });

  it('ignores invalid lines in YAML mapping', () => {
    const input = `
VAR1: value1
invalid line
VAR2: value2
`;
    expect(parseEnvInput(input)).toEqual({ VAR1: 'value1', VAR2: 'value2' });
  });
});