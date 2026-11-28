// Platform, access, support, messaging, notification, API and settings pages, moved from App.jsx.
// App.jsx renders this with the values the pages need; add or change these pages' props here.
import { MessagesPageV2 } from "../../components/AppWidgets.jsx";
import { AccessCheckPage, ApiPage, AssistantPage, AuditLogPage, CustomerMessengerPanel, DataReconciliationPage, FinancialStatementsPage, HelpCenterPage, InsightsPage, NotificationsPage, OnboardingPage, PlatformAdminPage, RolesPermissionsPage, SettingsPage, SupportPage } from "../../config/lazyPages.js";
import { remoteApiEnabled } from "../../remote-api.js";
import { defaultRoles, permissionCatalog } from "../../services/permissions.js";
import { filterRows, modulePermissionCatalog } from "../../shared/lib/appDomain.jsx";

export function SystemPages({ active, activeTenantId, activeRoleInfo, collectionsLoading, addSupportTicketComment, apiSecretRows, applyDefaultUserPermissions, archiveMessageConversation, can, changeCurrentRole, choosePage, conversationId, createMessageConversation, createUser, creditRecords, currentUser, deleteMessageConversation, draftMessage, exportBackup, filtered, goLiveReport, helpArticles, helpModuleGuides, importBackup, integrityReport, markAllNotificationsRead, onOpeningImported, messageContextOptions, messageParticipantOptions, notificationAutomationRows, notificationFilter, notificationProviderRows, notify, onboardingRows, openLinkedCredit, openLinkedCustomer, openLinkedSalesOrder, openSupportConversation, openSupportTicket, productionHardeningReport, query, rotateApiSecret, runApiAction, runGoLiveCheck, runIntegrityCheck, runNotificationDispatchAction, runProductionHardeningCheck, saveSettings, selectMessageThread, selectedSupportTicketId, sendMessage, setDraftMessage, setNotificationFilter, setSelectedSupportTicketId, state, toggleSetting, toggleUserModuleAccess, updateCompany, updateSupportTicketStatus, updateUserProfile, updateUserRole, updateUserStatus }) {
  return (
    <>
          {active === "platform" && <PlatformAdminPage />}
          {active === "assistant" && <AssistantPage />}
          {active === "insights" && <InsightsPage />}
          {active === "roles" && (
            <RolesPermissionsPage
              appUsers={state.settings.users || []}
              appRoles={state.settings.roles || defaultRoles}
              modulePermissionCatalog={modulePermissionCatalog}
              onCreateAppUser={createUser}
              onUpdateAppUser={updateUserProfile}
              onUpdateAppUserStatus={updateUserStatus}
              onApplyDefaultPermissions={applyDefaultUserPermissions}
              onChangeAppUserRole={updateUserRole}
              onToggleAppUserModule={toggleUserModuleAccess}
              canOverrideUserPermissions={["Super Admin", "Platform Super Admin"].includes(currentUser?.role)}
              requiresPassword={remoteApiEnabled}
              canManageUsers={can("settings.manage")}
            />
          )}
          {active === "access-check" && <AccessCheckPage />}
          {active === "audit" && <AuditLogPage />}
          {active === "financial-statements" && <FinancialStatementsPage />}
          {active === "data-reconciliation" && <DataReconciliationPage />}
          {active === "support" && (
            <SupportPage
              tickets={filtered.supportTickets}
              loading={collectionsLoading}
              orders={state.orders}
              credits={creditRecords}
              customers={state.customers}
              conversations={state.conversations || []}
              selectedTicketId={selectedSupportTicketId}
              onSelectTicket={setSelectedSupportTicketId}
              onAddComment={addSupportTicketComment}
              onUpdateStatus={updateSupportTicketStatus}
              onOpenConversation={openSupportConversation}
              onOpenSalesOrder={openLinkedSalesOrder}
              onOpenCredit={openLinkedCredit}
              onOpenCustomer={openLinkedCustomer}
            />
          )}
          {active === "help" && (
            <HelpCenterPage
              articles={filterRows(helpArticles, query)}
              guides={filterRows(helpModuleGuides, query)}
              onboardingRows={onboardingRows}
              snapshot={state.helpGuideSnapshot}
              onOpenModule={choosePage}
            />
          )}
          {active === "onboarding" && (
            <OnboardingPage
              onboarding={state.onboarding}
              rows={onboardingRows}
              onOpenModule={choosePage}
              tenantId={activeTenantId}
              can={can}
              notify={notify}
              onOpeningImported={onOpeningImported}
            />
          )}
          {active === "messages" && (
            <MessagesPageV2
              conversations={filtered.conversations}
              loading={collectionsLoading}
              conversationId={conversationId}
              setConversationId={selectMessageThread}
              draftMessage={draftMessage}
              setDraftMessage={setDraftMessage}
              sendMessage={sendMessage}
              canSend={can("messages.send")}
              canManage={can("messages.manage")}
              currentUser={currentUser}
              participants={messageParticipantOptions}
              contextOptions={messageContextOptions}
              onCreateConversation={createMessageConversation}
              onArchiveConversation={archiveMessageConversation}
              onDeleteConversation={deleteMessageConversation}
              onOpenSalesOrder={openLinkedSalesOrder}
              onOpenCredit={openLinkedCredit}
              onOpenSupportTicket={openSupportTicket}
              onOpenCustomer={openLinkedCustomer}
            />
          )}
          {active === "notifications" && (
            <div className="stack u-margin-bottom-16px" ><CustomerMessengerPanel /></div>
          )}
          {active === "notifications" && (
            <NotificationsPage
              notifications={filtered.notifications}
              automationRows={notificationAutomationRows}
              providerRows={notificationProviderRows}
              sendLog={state.notificationSendLog || []}
              dispatchSnapshot={state.notificationDispatchSnapshot}
              filter={notificationFilter}
              setFilter={setNotificationFilter}
              markAll={markAllNotificationsRead}
              runDispatch={runNotificationDispatchAction}
              lastSweepAt={state.notificationSweepAt}
              canManage={can("notifications.manage")}
            />
          )}
          {active === "api" && (
            <ApiPage
              webhooks={filtered.apiWebhooks}
              secrets={apiSecretRows}
              logs={state.apiWebhookLogs || []}
              snapshot={state.apiIntegrationSnapshot}
              dbMeta={state.dbMeta}
              auditLog={state.auditLog || []}
              onRunTest={runApiAction}
              onRotateSecret={rotateApiSecret}
              canManage={can("api.manage")}
            />
          )}
          {active === "settings" && (
            <SettingsPage
              settings={state.settings}
              activeRole={activeRoleInfo}
              auditLog={state.auditLog || []}
              dbMeta={state.dbMeta}
              integrityReport={integrityReport}
              integritySnapshot={state.integritySnapshot}
              goLiveReport={goLiveReport}
              goLiveSnapshot={state.goLiveSnapshot}
              productionHardeningReport={productionHardeningReport}
              productionHardeningSnapshot={state.productionHardeningSnapshot}
              permissionCatalog={permissionCatalog}
              modulePermissionCatalog={modulePermissionCatalog}
              toggleSetting={toggleSetting}
              updateCompany={updateCompany}
              onSaveSettings={saveSettings}
              onChangeRole={changeCurrentRole}
              users={state.settings.users || []}
              onCreateUser={createUser}
              onUpdateUserStatus={updateUserStatus}
              onToggleUserModule={toggleUserModuleAccess}
              onRunIntegrityCheck={runIntegrityCheck}
              onRunGoLiveCheck={runGoLiveCheck}
              onRunProductionHardeningCheck={runProductionHardeningCheck}
              onExportBackup={exportBackup}
              onImportBackup={importBackup}
              notify={notify}
              requiresPassword={remoteApiEnabled}
              canManageSettings={can("settings.manage")}
              canOverrideUserPermissions={["Super Admin", "Platform Super Admin"].includes(currentUser?.role)}
              canRunSystemBackup={can("system.backup")}
              onOpenAccessCenter={() => choosePage("roles")}
            />
          )}
    </>
  );
}
