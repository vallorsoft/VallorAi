import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name!: string

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string

  @ApiProperty({ example: 'ro', required: false })
  @IsString()
  @IsOptional()
  language?: string

  @ApiProperty({ example: 'RO', required: false })
  @IsString()
  @IsOptional()
  country?: string
}
