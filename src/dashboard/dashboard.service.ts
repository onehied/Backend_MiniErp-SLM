import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private toDayKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private toMonthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private toYearKey(date: Date) {
    return String(date.getFullYear());
  }

  private buildRevenueSeries(
    invoices: Array<{
      issueDate: Date;
      totalAmount: number;
      status: string;
    }>,
    period: 'daily' | 'monthly' | 'yearly',
  ) {
    const now = new Date();
    const entries: Array<{
      key: string;
      label: string;
      revenue: number;
      invoiceCount: number;
    }> = [];

    if (period === 'daily') {
      for (let offset = 13; offset >= 0; offset -= 1) {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        date.setDate(now.getDate() - offset);
        entries.push({
          key: this.toDayKey(date),
          label: new Intl.DateTimeFormat('id-ID', {
            day: '2-digit',
            month: 'short',
          }).format(date),
          revenue: 0,
          invoiceCount: 0,
        });
      }
    }

    if (period === 'monthly') {
      for (let offset = 11; offset >= 0; offset -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        entries.push({
          key: this.toMonthKey(date),
          label: new Intl.DateTimeFormat('id-ID', {
            month: 'short',
            year: '2-digit',
          }).format(date),
          revenue: 0,
          invoiceCount: 0,
        });
      }
    }

    if (period === 'yearly') {
      for (let offset = 4; offset >= 0; offset -= 1) {
        const date = new Date(now.getFullYear() - offset, 0, 1);
        entries.push({
          key: this.toYearKey(date),
          label: this.toYearKey(date),
          revenue: 0,
          invoiceCount: 0,
        });
      }
    }

    const entryMap = new Map(entries.map((entry) => [entry.key, entry]));

    invoices.forEach((invoice) => {
      const issueDate = new Date(invoice.issueDate);
      const key =
        period === 'daily'
          ? this.toDayKey(issueDate)
          : period === 'monthly'
            ? this.toMonthKey(issueDate)
            : this.toYearKey(issueDate);
      const target = entryMap.get(key);

      if (!target) {
        return;
      }

      target.invoiceCount += 1;

      if (invoice.status === 'PAID') {
        target.revenue += invoice.totalAmount;
      }
    });

    return entries;
  }

  async getSummary() {
    const totalCustomers = await this.prisma.customer.count();

    const totalInvoices = await this.prisma.invoice.count();

    const invoices = await this.prisma.invoice.findMany();

    const totalRevenue = invoices.reduce(
      (sum, inv) => sum + inv.totalAmount,
      0,
    );

    const paidInvoices = await this.prisma.invoice.count({
      where: { status: 'PAID' },
    });

    const pendingInvoices = totalInvoices - paidInvoices;

    const invoicesByStatus = await this.prisma.invoice.groupBy({
      by: ['status'],
      _count: true,
    });

    return {
      totalCustomers,
      totalInvoices,
      totalRevenue,
      paidInvoices,
      pendingInvoices,
      invoicesByStatus: invoicesByStatus.map((item) => ({
        status: item.status,
        count: item._count,
      })),
    };
  }

  async getRecentInvoices(limit: number = 10) {
    return this.prisma.invoice.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        customer: true,
      },
    });
  }

  async getRecentCustomers(limit: number = 10) {
    return this.prisma.customer.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getMonthlyRevenue() {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: 'PAID',
      },
    });

    const monthlyData: Record<string, number> = {};

    invoices.forEach((invoice) => {
      const month = invoice.createdAt.toISOString().slice(0, 7); // YYYY-MM format
      monthlyData[month] = (monthlyData[month] || 0) + invoice.totalAmount;
    });

    return Object.entries(monthlyData)
      .map(([month, revenue]) => ({
        month,
        revenue,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async getRevenueTrends() {
    const invoices = await this.prisma.invoice.findMany({
      select: {
        issueDate: true,
        totalAmount: true,
        status: true,
      },
    });

    return {
      daily: this.buildRevenueSeries(invoices, 'daily'),
      monthly: this.buildRevenueSeries(invoices, 'monthly'),
      yearly: this.buildRevenueSeries(invoices, 'yearly'),
    };
  }
}
