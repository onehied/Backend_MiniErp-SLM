import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary() {
    return this.dashboardService.getSummary();
  }

  @Get('recent-invoices')
  async getRecentInvoices(@Query('limit') limit: string = '10') {
    return this.dashboardService.getRecentInvoices(parseInt(limit));
  }

  @Get('recent-customers')
  async getRecentCustomers(@Query('limit') limit: string = '10') {
    return this.dashboardService.getRecentCustomers(parseInt(limit));
  }

  @Get('monthly-revenue')
  async getMonthlyRevenue() {
    return this.dashboardService.getMonthlyRevenue();
  }

  @Get('revenue-trends')
  async getRevenueTrends() {
    return this.dashboardService.getRevenueTrends();
  }
}
