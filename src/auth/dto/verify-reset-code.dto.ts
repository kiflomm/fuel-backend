import { IsString, Length, Matches } from 'class-validator';

export class VerifyResetCodeDto {
    @IsString()
    @Length(6, 6, { message: 'Code must be exactly 6 digits' })
    @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
    code: string;
}
