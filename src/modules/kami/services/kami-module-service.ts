import { MedusaService } from "@medusajs/framework/utils"
import {
  KamiApproval,
  KamiArtifact,
  KamiAuditLog,
  KamiJob,
  KamiMemory,
  KamiMessage,
  KamiReportTemplate,
  KamiSession,
  KamiSkill,
} from "@models"
import type {
  KamiApprovalDTO,
  KamiArtifactDTO,
  KamiAuditLogDTO,
  KamiJobDTO,
  KamiMemoryDTO,
  KamiMessageDTO,
  KamiReportTemplateDTO,
  KamiSessionDTO,
  KamiSkillDTO,
} from "@types"

/**
 * KAMI module service.
 *
 * Phase 0 relies on MedusaService auto-generated CRUD, which exposes:
 *   listKamiSessions / listAndCountKamiSessions / retrieveKamiSession
 *   createKamiSessions / updateKamiSessions / deleteKamiSessions
 *   listKamiMessages / listAndCountKamiMessages / retrieveKamiMessage
 *   createKamiMessages / updateKamiMessages / deleteKamiMessages
 *
 * Phase 1 will add domain helpers (sessionsWithMessages, appendMessage,
 * audit/approval persistence, etc.).
 */
class KamiModuleService extends MedusaService<{
  KamiSession: { dto: KamiSessionDTO; model: typeof KamiSession }
  KamiMessage: { dto: KamiMessageDTO; model: typeof KamiMessage }
  KamiSkill: { dto: KamiSkillDTO; model: typeof KamiSkill }
  KamiMemory: { dto: KamiMemoryDTO; model: typeof KamiMemory }
  KamiJob: { dto: KamiJobDTO; model: typeof KamiJob }
  KamiAuditLog: { dto: KamiAuditLogDTO; model: typeof KamiAuditLog }
  KamiApproval: { dto: KamiApprovalDTO; model: typeof KamiApproval }
  KamiArtifact: { dto: KamiArtifactDTO; model: typeof KamiArtifact }
  KamiReportTemplate: { dto: KamiReportTemplateDTO; model: typeof KamiReportTemplate }
}>({
  KamiSession,
  KamiMessage,
  KamiSkill,
  KamiMemory,
  KamiJob,
  KamiAuditLog,
  KamiApproval,
  KamiArtifact,
  KamiReportTemplate,
}) {}

export default KamiModuleService
