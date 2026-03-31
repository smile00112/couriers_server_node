import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class VerifyCodeDto {
  @IsUUID() owner_id!: string;

  @IsString() phone!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  code!: string;
}
