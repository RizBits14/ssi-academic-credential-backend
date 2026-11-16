import { Injectable } from '@nestjs/common';

import {
  AcademicRecordStatus,
  CredentialStatus,
  OrganizationStatus,
  OrganizationType,
  TrustedIssuerStatus,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardOverview() {
    const [
      totalOrganizations,
      universities,
      banks,
      activeOrganizations,
      suspendedOrganizations,
      disabledOrganizations,
      totalUsers,
      systemAdmins,
      issuerAdmins,
      verifierAdmins,
      holders,
      totalAcademicRecords,
      activeAcademicRecords,
      graduatedAcademicRecords,
      withdrawnAcademicRecords,
      invalidAcademicRecords,
      totalCredentials,
      activeCredentials,
      suspendedCredentials,
      revokedCredentials,
      expiredCredentials,
      totalTrustedIssuers,
      trustedIssuers,
      suspendedTrustedIssuers,
      revokedTrustedIssuers,
      recentAuditLogs,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.count({
        where: { type: OrganizationType.UNIVERSITY },
      }),
      this.prisma.organization.count({
        where: { type: OrganizationType.BANK },
      }),
      this.prisma.organization.count({
        where: { status: OrganizationStatus.ACTIVE },
      }),
      this.prisma.organization.count({
        where: { status: OrganizationStatus.SUSPENDED },
      }),
      this.prisma.organization.count({
        where: { status: OrganizationStatus.DISABLED },
      }),

      this.prisma.user.count(),
      this.prisma.user.count({
        where: { role: UserRole.SYSTEM_ADMIN },
      }),
      this.prisma.user.count({
        where: { role: UserRole.ISSUER_ADMIN },
      }),
      this.prisma.user.count({
        where: { role: UserRole.VERIFIER_ADMIN },
      }),
      this.prisma.user.count({
        where: { role: UserRole.HOLDER },
      }),

      this.prisma.academicRecord.count(),
      this.prisma.academicRecord.count({
        where: { status: AcademicRecordStatus.ACTIVE },
      }),
      this.prisma.academicRecord.count({
        where: { status: AcademicRecordStatus.GRADUATED },
      }),
      this.prisma.academicRecord.count({
        where: { status: AcademicRecordStatus.WITHDRAWN },
      }),
      this.prisma.academicRecord.count({
        where: { status: AcademicRecordStatus.INVALID },
      }),

      this.prisma.credential.count(),
      this.prisma.credential.count({
        where: { status: CredentialStatus.ACTIVE },
      }),
      this.prisma.credential.count({
        where: { status: CredentialStatus.SUSPENDED },
      }),
      this.prisma.credential.count({
        where: { status: CredentialStatus.REVOKED },
      }),
      this.prisma.credential.count({
        where: { status: CredentialStatus.EXPIRED },
      }),

      this.prisma.trustedIssuer.count(),
      this.prisma.trustedIssuer.count({
        where: { status: TrustedIssuerStatus.TRUSTED },
      }),
      this.prisma.trustedIssuer.count({
        where: { status: TrustedIssuerStatus.SUSPENDED },
      }),
      this.prisma.trustedIssuer.count({
        where: { status: TrustedIssuerStatus.REVOKED },
      }),

      this.prisma.auditLog.findMany({
        select: {
          id: true,
          actorId: true,
          organizationId: true,
          action: true,
          resourceType: true,
          resourceId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      }),
    ]);

    const actorIds = [
      ...new Set(
        recentAuditLogs
          .map((log) => log.actorId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const organizationIds = [
      ...new Set(
        recentAuditLogs
          .map((log) => log.organizationId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const [actors, organizations] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { in: actorIds },
        },
        select: {
          id: true,
          name: true,
          role: true,
        },
      }),

      this.prisma.organization.findMany({
        where: {
          id: { in: organizationIds },
        },
        select: {
          id: true,
          name: true,
          type: true,
        },
      }),
    ]);

    const actorById = new Map(
      actors.map((actor) => [actor.id, actor] as const),
    );

    const organizationById = new Map(
      organizations.map(
        (organization) => [organization.id, organization] as const,
      ),
    );

    return {
      organizations: {
        total: totalOrganizations,
        byType: {
          university: universities,
          bank: banks,
        },
        byStatus: {
          active: activeOrganizations,
          suspended: suspendedOrganizations,
          disabled: disabledOrganizations,
        },
      },

      users: {
        total: totalUsers,
        byRole: {
          systemAdmin: systemAdmins,
          issuerAdmin: issuerAdmins,
          verifierAdmin: verifierAdmins,
          holder: holders,
        },
      },

      academicRecords: {
        total: totalAcademicRecords,
        byStatus: {
          active: activeAcademicRecords,
          graduated: graduatedAcademicRecords,
          withdrawn: withdrawnAcademicRecords,
          invalid: invalidAcademicRecords,
        },
      },

      credentials: {
        total: totalCredentials,
        byStatus: {
          active: activeCredentials,
          suspended: suspendedCredentials,
          revoked: revokedCredentials,
          expired: expiredCredentials,
        },
      },

      trustedIssuers: {
        total: totalTrustedIssuers,
        byStatus: {
          trusted: trustedIssuers,
          suspended: suspendedTrustedIssuers,
          revoked: revokedTrustedIssuers,
        },
      },

      recentActivities: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        createdAt: log.createdAt,

        actor: log.actorId ? (actorById.get(log.actorId) ?? null) : null,

        organization: log.organizationId
          ? (organizationById.get(log.organizationId) ?? null)
          : null,
      })),
    };
  }
}
