import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  private getErrorLabel(status: number) {
    const statusKey = HttpStatus[status];

    if (typeof statusKey !== 'string') {
      return 'Error';
    }

    return statusKey
      .split('_')
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  }

  private shouldSkipLogging(path: string | undefined) {
    if (!path) {
      return false;
    }

    return (
      path.startsWith('/api/activity-logs') ||
      path.startsWith('/uploads/') ||
      path.includes('.well-known')
    );
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = this.getErrorLabel(status);
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        const body = exceptionResponse as Record<string, any>;
        message = body.message;
        error =
          typeof body.error === 'string' && body.error.trim().length > 0
            ? body.error
            : this.getErrorLabel(status);
      } else {
        message = 'Unexpected error';
        error = this.getErrorLabel(status);
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
    }

    const body: ErrorResponse = {
      statusCode: status,
      message,
      error,
    };

    const requestPath = request?.originalUrl || request?.url;
    if (!this.shouldSkipLogging(requestPath)) {
      void this.activityLogsService.log({
        action: 'ERROR',
        module: 'SYSTEM',
        status: 'FAILED',
        message: Array.isArray(message) ? message.join(', ') : message,
        entityType: 'HTTP_REQUEST',
        entityId: requestPath || null,
        metadata: {
          statusCode: status,
          error,
          message,
        },
        context: this.activityLogsService.getRequestContext(request),
      });
    }

    response.status(status).json(body);
  }
}
