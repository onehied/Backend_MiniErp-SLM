import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityLogsService } from './activity-logs.service';
import {
  ListActivityLogsQueryDto,
  TrackNavigationDto,
} from './dto/activity-log.dto';

@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  async findAll(@Query() query: ListActivityLogsQueryDto) {
    return this.activityLogsService.findAll(query);
  }

  @Post('navigation')
  async trackNavigation(@Req() req: any, @Body() dto: TrackNavigationDto) {
    await this.activityLogsService.log({
      action: 'NAVIGATE',
      module: 'NAVIGATION',
      status: 'SUCCESS',
      message: `User membuka halaman ${dto.path}`,
      entityType: 'ROUTE',
      entityId: dto.path,
      metadata: {
        path: dto.path,
        title: dto.title || null,
        referrer: dto.referrer || null,
      },
      context: this.activityLogsService.getRequestContext(req),
    });

    return {
      message: 'Navigation logged.',
    };
  }
}
