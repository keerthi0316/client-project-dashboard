import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../types/auth';
import { AppError } from '../utils/errors';

function canProject(u: any, p: any) {
  return (
    u.role === 'ADMIN' ||
    (u.role === 'PROJECT_MANAGER' && p.creatorId === u.id)
  );
}

/**
 * List tasks
 *
 * ADMIN:
 *   Can see all tasks.
 *
 * PROJECT_MANAGER:
 *   Can see tasks belonging to projects they created.
 *
 * DEVELOPER:
 *   Can see only tasks assigned to them.
 */
export async function listTasks(
  req: AuthRequest,
  res: Response
) {
  const u = req.user!;
  const q = req.query;

  const where: any = {};

  // Status filter
  if (q.status) {
    where.status = String(q.status);
  }

  // Priority filter
  if (q.priority) {
    where.priority = String(q.priority);
  }

  // Due-date filter
  if (q.from || q.to) {
    where.dueDate = {
      ...(q.from
        ? { gte: new Date(String(q.from)) }
        : {}),
      ...(q.to
        ? { lte: new Date(String(q.to)) }
        : {})
    };
  }

  // Developer can only see assigned tasks
  if (u.role === 'DEVELOPER') {
    where.developerId = u.id;
  }

  // PM can only see tasks from their own projects
  else if (u.role === 'PROJECT_MANAGER') {
    where.project = {
      creatorId: u.id
    };
  }

  // Admin sees everything

  const tasks = await prisma.task.findMany({
    where,

    include: {
      project: {
        select: {
          id: true,
          name: true,
          creatorId: true
        }
      },

      developer: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },

    orderBy: [
      {
        priority: 'desc'
      },
      {
        dueDate: 'asc'
      }
    ]
  });

  res.json({
    success: true,
    data: tasks
  });
}


/**
 * Create task
 */
export async function createTask(
  req: AuthRequest,
  res: Response
) {
  const u = req.user!;

  const p = await prisma.project.findUnique({
    where: {
      id: String(req.params.projectId)
    }
  });

  if (!p) {
    throw new AppError(
      404,
      'PROJECT_NOT_FOUND',
      'Project not found'
    );
  }

  /*
   * Admin can manage every project.
   *
   * PM can manage only projects they created.
   */
  if (!canProject(u, p)) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'You cannot manage this project'
    );
  }

  /*
   * Validate developer
   */
  if (req.body.developerId) {
    const d = await prisma.user.findUnique({
      where: {
        id: req.body.developerId
      }
    });

    if (!d || d.role !== 'DEVELOPER') {
      throw new AppError(
        400,
        'INVALID_DEVELOPER',
        'Assigned user must be a developer'
      );
    }
  }

  /*
   * Create task
   */
  const t = await prisma.task.create({
    data: {
      ...req.body,
      projectId: p.id
    }
  });

  /*
   * Create activity
   */
  await prisma.activity.create({
    data: {
      type: 'TASK_CREATED',
      message: `Task #${t.id} was created`,
      userId: u.id,
      projectId: p.id,
      taskId: t.id
    }
  });

  /*
   * Notify assigned developer
   */
  if (t.developerId) {
    const n = await prisma.notification.create({
      data: {
        userId: t.developerId,
        taskId: t.id,
        message: `Task #${t.id} was assigned to you`
      }
    });

    /*
     * Send real-time notification
     */
    req
      .app
      .get('io')
      ?.to(`user:${t.developerId}`)
      .emit('notification:new', n);
  }

  /*
   * Send task-created activity in real time
   */
  req
    .app
    .get('io')
    ?.to(`project:${p.id}`)
    .emit('activity:new', {
      type: 'TASK_CREATED',
      message: `Task #${t.id} was created`,
      userId: u.id,
      projectId: p.id,
      taskId: t.id
    });

  res.status(201).json({
    success: true,
    data: t
  });
}


/**
 * Update task status
 *
 * Authorization:
 *
 * ADMIN
 *   Can update any task.
 *
 * PROJECT_MANAGER
 *   Can update tasks belonging to their own projects.
 *
 * DEVELOPER
 *   Can update only tasks assigned to themselves.
 *
 * Notifications:
 *
 * DEVELOPER moves task to IN_REVIEW
 *      ↓
 * PM receives notification
 *
 * Any user changes task status
 *      ↓
 * All other Admins receive notification
 *
 * Activity:
 *      ↓
 * Project room
 * Admin room
 * PM room
 * Developer room
 */
export async function updateStatus(
  req: AuthRequest,
  res: Response
) {
  const u = req.user!;

  const taskId = Number(req.params.id);

  if (Number.isNaN(taskId)) {
    throw new AppError(
      400,
      'INVALID_TASK_ID',
      'Invalid task ID'
    );
  }

  /*
   * Find task
   */
  const t = await prisma.task.findUnique({
    where: {
      id: taskId
    },

    include: {
      project: true,
      developer: true
    }
  });

  if (!t) {
    throw new AppError(
      404,
      'TASK_NOT_FOUND',
      'Task not found'
    );
  }

  /*
   * Developer security
   *
   * Developer cannot modify another developer's task.
   */
  if (
    u.role === 'DEVELOPER' &&
    t.developerId !== u.id
  ) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'You can update only tasks assigned to you'
    );
  }

  /*
   * Project Manager security
   *
   * PM cannot modify another PM's project task.
   */
  if (
    u.role === 'PROJECT_MANAGER' &&
    t.project.creatorId !== u.id
  ) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'You cannot manage this task'
    );
  }

  /*
   * Admin is allowed to update any task.
   */

  const old = t.status;
  const newStatus = req.body.status;

  /*
   * Don't create activity/notifications if
   * the status hasn't actually changed.
   */
  if (old === newStatus) {
    return res.json({
      success: true,
      data: t
    });
  }

  /*
   * Validate status
   */
  const allowedStatuses = [
    'TODO',
    'IN_PROGRESS',
    'IN_REVIEW',
    'DONE',
    'OVERDUE'
  ];

  if (!allowedStatuses.includes(newStatus)) {
    throw new AppError(
      400,
      'INVALID_STATUS',
      `Invalid task status: ${newStatus}`
    );
  }

  /*
   * Transaction
   *
   * Everything inside this transaction succeeds
   * or everything rolls back.
   */
  const result = await prisma.$transaction(
    async (tx) => {

      /*
       * 1. Update task status
       */
      const updated = await tx.task.update({
        where: {
          id: t.id
        },

        data: {
          status: newStatus
        }
      });

      /*
       * 2. Create activity
       */
      const activity = await tx.activity.create({
        data: {
          type: 'TASK_STATUS_CHANGED',

          message:
            `Task #${t.id} moved from ` +
            `${old} → ${newStatus}`,

          oldStatus: old,
          newStatus,

          userId: u.id,
          projectId: t.projectId,
          taskId: t.id
        }
      });

      /*
       * 3. PM notification
       *
       * Only when task moves to IN_REVIEW.
       *
       * The PM who performed the action should
       * not receive their own notification.
       */
      let pmNotification: any = null;

      if (
        newStatus === 'IN_REVIEW' &&
        t.project.creatorId !== u.id
      ) {
        pmNotification =
          await tx.notification.create({
            data: {
              userId: t.project.creatorId,
              taskId: t.id,
              message:
                `Task #${t.id} moved to In Review`
            }
          });
      }

      /*
       * 4. Find Admin users
       *
       * We don't notify the person who made
       * the change if that person is an Admin.
       */
      const admins = await tx.user.findMany({
        where: {
          role: 'ADMIN',

          id: {
            not: u.id
          }
        },

        select: {
          id: true
        }
      });

      /*
       * 5. Create Admin notifications
       */
      const adminNotifications: any[] = [];

      for (const admin of admins) {
        const adminNotification =
          await tx.notification.create({
            data: {
              userId: admin.id,
              taskId: t.id,

              message:
                `Task #${t.id} status changed ` +
                `from ${old} to ${newStatus}`
            }
          });

        adminNotifications.push(
          adminNotification
        );
      }

      return {
        updated,
        activity,
        pmNotification,
        adminNotifications
      };
    }
  );

  /*
   * Socket.IO
   */
  const io = req.app.get('io');

  if (io) {

    /*
     * -----------------------------------------
     * ACTIVITY EVENTS
     * -----------------------------------------
     */

    /*
     * Everyone viewing the project
     */
    io
      .to(`project:${t.projectId}`)
      .emit(
        'activity:new',
        result.activity
      );

    /*
     * Admin activity feed
     */
    io
      .to('role:admin')
      .emit(
        'activity:new',
        result.activity
      );

    /*
     * PM activity feed
     */
    io
      .to(`pm:${t.project.creatorId}`)
      .emit(
        'activity:new',
        result.activity
      );

    /*
     * Developer activity feed
     */
    if (t.developerId) {
      io
        .to(`user:${t.developerId}`)
        .emit(
          'activity:new',
          result.activity
        );
    }


    /*
     * -----------------------------------------
     * PM NOTIFICATION
     * -----------------------------------------
     */

    if (result.pmNotification) {
      io
        .to(`user:${t.project.creatorId}`)
        .emit(
          'notification:new',
          result.pmNotification
        );
    }


    /*
     * -----------------------------------------
     * ADMIN NOTIFICATIONS
     * -----------------------------------------
     */

    for (
      const notification
      of result.adminNotifications
    ) {
      io
        .to(`user:${notification.userId}`)
        .emit(
          'notification:new',
          notification
        );
    }
  }

  /*
   * API response
   */
  res.json({
    success: true,
    data: result.updated
  });
}