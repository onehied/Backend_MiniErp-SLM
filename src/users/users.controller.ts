import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  AssignRoleDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  @Get()
  async findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateUserDto) {
    return this.usersService.create(
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(
      id,
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.usersService.remove(
      id,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Post(':id/roles')
  async assignRole(@Req() req: any, @Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(
      id,
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Delete(':id/roles/:roleId')
  async removeRole(@Req() req: any, @Param('id') id: string, @Param('roleId') roleId: string) {
    return this.usersService.removeRole(
      id,
      roleId,
      this.activityLogsService.getRequestContext(req),
    );
  }
}
