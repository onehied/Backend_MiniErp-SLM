import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(
      id,
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.rolesService.remove(
      id,
      this.activityLogsService.getRequestContext(req),
    );
  }
}
