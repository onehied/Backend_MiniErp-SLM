import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  ListCustomersQueryDto,
} from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class CustomersController {
  constructor(
    private customersService: CustomersService,
    private activityLogsService: ActivityLogsService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Get()
  async findAll(@Query() query: ListCustomersQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get('export/data')
  async exportData(
    @Query() query: ListCustomersQueryDto,
  ) {
    const format = query.format ?? 'csv';
    return this.customersService.exportData(format, query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(
      id,
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.customersService.remove(
      id,
      this.activityLogsService.getRequestContext(req),
    );
  }
}
