import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateDto {
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsString()
  @IsNotEmpty()
  domain: string;

  @IsString()
  @IsNotEmpty()
  dslPath: string;
}
