import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class GenerateDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/, {
    message: 'projectName must start with alphanumeric and contain only letters, digits, underscore, or hyphen (max 100 chars)',
  })
  projectName: string;

  @IsString()
  @IsNotEmpty()
  domain: string;

  @IsString()
  @IsNotEmpty()
  dslPath: string;
}
