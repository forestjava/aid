import { parseFileOutput } from './file-parser';

describe('parseFileOutput', () => {
  it('should parse multiple files', () => {
    const input = `===FILE: src/app.module.ts===
import { Module } from '@nestjs/common';
@Module({})
export class AppModule {}
===END_FILE===

===FILE: src/user/user.controller.ts===
import { Controller } from '@nestjs/common';
@Controller('users')
export class UserController {}
===END_FILE===`;

    const result = parseFileOutput(input);
    expect(result.size).toBe(2);
    expect(result.get('src/app.module.ts')).toContain('AppModule');
    expect(result.get('src/user/user.controller.ts')).toContain('UserController');
  });

  it('should ignore text outside markers', () => {
    const input = `Here is code:\n===FILE: a.ts===\nconst x = 1;\n===END_FILE===\nDone!`;
    const result = parseFileOutput(input);
    expect(result.size).toBe(1);
    expect(result.get('a.ts')).toBe('const x = 1;');
  });

  it('should return empty map for no markers', () => {
    expect(parseFileOutput('no markers here').size).toBe(0);
  });
});
