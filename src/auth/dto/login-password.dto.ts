import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class LoginPasswordDto {
  @IsUUID() owner_id!: string;

  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
