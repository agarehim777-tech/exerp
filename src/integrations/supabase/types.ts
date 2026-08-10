export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          created_at: string
          end_date: string
          id: string
          locked_at: string | null
          locked_by: string | null
          name: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          name: string
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          name?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          level: string
          message: string
          source: string | null
          stack: string | null
          tenant_id: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          level: string
          message: string
          source?: string | null
          stack?: string | null
          tenant_id?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          source?: string | null
          stack?: string | null
          tenant_id?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          detail: string | null
          id: string
          module: string
          occurred_at: string
          payload: Json
          status: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: string | null
          id: string
          module: string
          occurred_at?: string
          payload?: Json
          status?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          module?: string
          occurred_at?: string
          payload?: Json
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changed_fields: string[] | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      cash_accounts: {
        Row: {
          account_no: string | null
          created_at: string
          currency: string
          gl_account_id: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          tenant_id: string
          type: Database["public"]["Enums"]["cash_account_type"]
          updated_at: string
        }
        Insert: {
          account_no?: string | null
          created_at?: string
          currency?: string
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          tenant_id: string
          type?: Database["public"]["Enums"]["cash_account_type"]
          updated_at?: string
        }
        Update: {
          account_no?: string | null
          created_at?: string
          currency?: string
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          tenant_id?: string
          type?: Database["public"]["Enums"]["cash_account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          account_id: string
          amount: number
          category: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          description: string | null
          direction: Database["public"]["Enums"]["cash_direction"]
          id: string
          occurred_at: string
          reference: string | null
          tenant_id: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          category?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          direction: Database["public"]["Enums"]["cash_direction"]
          id?: string
          occurred_at?: string
          reference?: string | null
          tenant_id: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          category?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["cash_direction"]
          id?: string
          occurred_at?: string
          reference?: string | null
          tenant_id?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_adjustments: {
        Row: {
          adjustment_type: string
          created_at: string
          created_by: string
          credit_id: string
          id: string
          installment_id: string | null
          new_value: Json
          old_value: Json
          reason: string
          tenant_id: string
        }
        Insert: {
          adjustment_type: string
          created_at?: string
          created_by?: string
          credit_id: string
          id?: string
          installment_id?: string | null
          new_value?: Json
          old_value?: Json
          reason: string
          tenant_id: string
        }
        Update: {
          adjustment_type?: string
          created_at?: string
          created_by?: string
          credit_id?: string
          id?: string
          installment_id?: string | null
          new_value?: Json
          old_value?: Json
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_adjustments_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_adjustments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "credit_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_contracts: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          collection_stage: string
          contract_no: string
          created_at: string
          created_by: string
          customer_id: string | null
          daily_penalty_rate: number
          id: string
          initial_payment: number
          last_risk_calculated_at: string | null
          order_id: string | null
          principal: number
          risk_score: number
          start_date: string
          status: string
          tenant_id: string
          term_months: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          collection_stage?: string
          contract_no: string
          created_at?: string
          created_by?: string
          customer_id?: string | null
          daily_penalty_rate?: number
          id?: string
          initial_payment?: number
          last_risk_calculated_at?: string | null
          order_id?: string | null
          principal: number
          risk_score?: number
          start_date: string
          status?: string
          tenant_id: string
          term_months: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          collection_stage?: string
          contract_no?: string
          created_at?: string
          created_by?: string
          customer_id?: string | null
          daily_penalty_rate?: number
          id?: string
          initial_payment?: number
          last_risk_calculated_at?: string | null
          order_id?: string | null
          principal?: number
          risk_score?: number
          start_date?: string
          status?: string
          tenant_id?: string
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_contracts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_installments: {
        Row: {
          created_at: string
          credit_id: string
          due_date: string
          id: string
          installment_no: number
          paid_at: string | null
          penalty_due: number
          penalty_paid: number
          principal_due: number
          principal_paid: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_id: string
          due_date: string
          id?: string
          installment_no: number
          paid_at?: string | null
          penalty_due?: number
          penalty_paid?: number
          principal_due: number
          principal_paid?: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_id?: string
          due_date?: string
          id?: string
          installment_no?: number
          paid_at?: string | null
          penalty_due?: number
          penalty_paid?: number
          principal_due?: number
          principal_paid?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_installments_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_installments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          credit_id: string
          id: string
          note: string | null
          paid_at: string
          payment_method: string
          penalty_amount: number
          principal_amount: number
          receipt_no: string
          tenant_id: string
          unallocated_amount: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          credit_id: string
          id?: string
          note?: string | null
          paid_at?: string
          payment_method?: string
          penalty_amount?: number
          principal_amount?: number
          receipt_no: string
          tenant_id: string
          unallocated_amount?: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          credit_id?: string
          id?: string
          note?: string | null
          paid_at?: string
          payment_method?: string
          penalty_amount?: number
          principal_amount?: number
          receipt_no?: string
          tenant_id?: string
          unallocated_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_restructures: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          new_term_months: number
          previous_balance: number
          reason: string
          replacement_credit_id: string
          source_credit_id: string
          tenant_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          new_term_months: number
          previous_balance: number
          reason: string
          replacement_credit_id: string
          source_credit_id: string
          tenant_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          new_term_months?: number
          previous_balance?: number
          reason?: string
          replacement_credit_id?: string
          source_credit_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_restructures_replacement_credit_id_fkey"
            columns: ["replacement_credit_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_restructures_source_credit_id_fkey"
            columns: ["source_credit_id"]
            isOneToOne: false
            referencedRelation: "credit_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_restructures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          body: string | null
          created_at: string
          customer_id: string | null
          deal_id: string | null
          id: string
          occurred_at: string
          owner_id: string | null
          subject: string
          tenant_id: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          deal_id?: string | null
          id?: string
          occurred_at?: string
          owner_id?: string | null
          subject: string
          tenant_id: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          deal_id?: string | null
          id?: string
          occurred_at?: string
          owner_id?: string | null
          subject?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_customer_tags: {
        Row: {
          customer_id: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          customer_id: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          customer_id?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_customer_tags_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_customer_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "crm_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_customer_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string | null
          expected_close: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          owner_id: string | null
          pipeline_id: string
          sort_order: number
          stage_id: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          expected_close?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          pipeline_id: string
          sort_order?: number
          stage_id: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          expected_close?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          pipeline_id?: string
          sort_order?: number
          stage_id?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          probability: number
          sort_order: number
          tenant_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          pipeline_id: string
          probability?: number
          sort_order?: number
          tenant_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          probability?: number
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deal_id: string | null
          done: boolean
          due_at: string | null
          id: string
          priority: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deal_id?: string | null
          done?: boolean
          due_at?: string | null
          id?: string
          priority?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deal_id?: string | null
          done?: boolean
          due_at?: string | null
          id?: string
          priority?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_base: boolean
          name: string
          symbol: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_base?: boolean
          name: string
          symbol?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_base?: boolean
          name?: string
          symbol?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "currencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_level_settings: {
        Row: {
          gold_min: number
          platinum_min: number
          silver_min: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          gold_min?: number
          platinum_min?: number
          silver_min?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          gold_min?: number
          platinum_min?: number
          silver_min?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_level_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string
          created_by: string | null
          customer_level_override: string | null
          email: string | null
          fin: string | null
          id: string
          last_activity_at: string | null
          name: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          segment: string
          tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          customer_level_override?: string | null
          email?: string | null
          fin?: string | null
          id?: string
          last_activity_at?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          segment?: string
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          customer_level_override?: string | null
          email?: string | null
          fin?: string | null
          id?: string
          last_activity_at?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          segment?: string
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_events: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          employee_id: string
          end_date: string | null
          event_type: string
          id: string
          payload: Json
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          employee_id: string
          end_date?: string | null
          event_type: string
          id?: string
          payload?: Json
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          employee_id?: string
          end_date?: string | null
          event_type?: string
          id?: string
          payload?: Json
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          position: string | null
          salary: number | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          position?: string | null
          salary?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          position?: string | null
          salary?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_timeline: {
        Row: {
          channel: string | null
          created_at: string
          created_by: string | null
          detail: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          tenant_id: string
          title: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json
          tenant_id: string
          title: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_timeline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          rate: number
          rate_date: string
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          id?: string
          rate: number
          rate_date?: string
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          rate?: number
          rate_date?: string
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_id: string | null
          amount: number
          category: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          expense_date: string
          expense_no: string | null
          gl_account_id: string | null
          id: string
          status: string
          tenant_id: string
          updated_at: string
          vat_amount: number
          vendor_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          expense_date?: string
          expense_no?: string | null
          gl_account_id?: string | null
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
          vat_amount?: number
          vendor_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          expense_date?: string
          expense_no?: string | null
          gl_account_id?: string | null
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          vat_amount?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_budgets: {
        Row: {
          actual_amount: number
          approved_at: string | null
          approved_by: string | null
          category: string
          cost_center_id: string
          created_at: string
          created_by: string
          currency: string
          fiscal_year: number
          id: string
          period_month: number
          planned_amount: number
          status: string
          tenant_id: string
        }
        Insert: {
          actual_amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category: string
          cost_center_id: string
          created_at?: string
          created_by?: string
          currency?: string
          fiscal_year: number
          id?: string
          period_month: number
          planned_amount?: number
          status?: string
          tenant_id: string
        }
        Update: {
          actual_amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          cost_center_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          fiscal_year?: number
          id?: string
          period_month?: number
          planned_amount?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_budgets_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_cost_centers: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          parent_id: string | null
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          parent_id?: string | null
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_cost_centers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reconciliations: {
        Row: {
          account_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          difference: number | null
          id: string
          ledger_balance: number
          payload: Json
          period_end: string
          period_start: string
          statement_balance: number
          status: string
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          difference?: number | null
          id?: string
          ledger_balance?: number
          payload?: Json
          period_end: string
          period_start: string
          statement_balance?: number
          status?: string
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          difference?: number | null
          id?: string
          ledger_balance?: number
          payload?: Json
          period_end?: string
          period_start?: string
          statement_balance?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_lines: {
        Row: {
          created_at: string
          grn_id: string
          id: string
          po_line_id: string
          qty_received: number
          qty_rejected: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          grn_id: string
          id?: string
          po_line_id: string
          qty_received: number
          qty_rejected?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          grn_id?: string
          id?: string
          po_line_id?: string
          qty_received?: number
          qty_rejected?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_match"
            referencedColumns: ["po_line_id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          grn_number: string
          id: string
          notes: string | null
          po_id: string
          receipt_date: string
          received_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grn_number: string
          id?: string
          notes?: string | null
          po_id: string
          receipt_date?: string
          received_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grn_number?: string
          id?: string
          notes?: string | null
          po_id?: string
          receipt_date?: string
          received_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_line_match"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_units: {
        Row: {
          batch_no: string | null
          bin_code: string | null
          created_at: string
          expiry_date: string | null
          id: string
          imei: string | null
          location_code: string | null
          metadata: Json
          product_id: string
          quantity: number
          rack_code: string | null
          serial_no: string | null
          source_id: string | null
          source_type: string | null
          status: string
          tenant_id: string
          unit_cost: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          batch_no?: string | null
          bin_code?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          imei?: string | null
          location_code?: string | null
          metadata?: Json
          product_id: string
          quantity?: number
          rack_code?: string | null
          serial_no?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          tenant_id: string
          unit_cost?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          batch_no?: string | null
          bin_code?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          imei?: string | null
          location_code?: string | null
          metadata?: Json
          product_id?: string
          quantity?: number
          rack_code?: string | null
          serial_no?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_units_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          method: string
          paid_at: string
          reference: string | null
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id: string
          method?: string
          paid_at?: string
          reference?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          method?: string
          paid_at?: string
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          posted: boolean
          posted_at: string | null
          reference: string | null
          source_id: string | null
          source_type: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          posted?: boolean
          posted_at?: string | null
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          posted?: boolean
          posted_at?: string | null
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          entry_id: string
          id: string
          line_no: number
          memo: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          line_no?: number
          memo?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          line_no?: number
          memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          body: string
          channel: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          last_error: string | null
          metadata: Json
          provider: string | null
          provider_message_id: string | null
          recipient: string
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string | null
          template_code: string | null
          tenant_id: string
        }
        Insert: {
          attempts?: number
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          recipient: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_code?: string | null
          tenant_id: string
        }
        Update: {
          attempts?: number
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_code?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          description: string | null
          discount_pct: number
          id: string
          line_no: number
          line_total: number
          order_id: string
          product_id: string | null
          qty: number
          tax_rate: number
          tenant_id: string
          unit_price: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_pct?: number
          id?: string
          line_no?: number
          line_total?: number
          order_id: string
          product_id?: string | null
          qty?: number
          tax_rate?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_pct?: number
          id?: string
          line_no?: number
          line_total?: number
          order_id?: string
          product_id?: string | null
          qty?: number
          tax_rate?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          discount_total: number
          due_date: string | null
          id: string
          notes: string | null
          order_date: string
          order_no: string
          paid_amount: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          quote_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
          vat_total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_no: string
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          quote_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
          vat_total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_no?: string
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          quote_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      procurement_cost_allocations: {
        Row: {
          allocated_amount: number
          basis_amount: number
          costing_version: number
          created_at: string
          id: string
          share: number
          shipment_cost_id: string
          shipment_id: string
          shipment_line_id: string
          tenant_id: string
        }
        Insert: {
          allocated_amount: number
          basis_amount: number
          costing_version: number
          created_at?: string
          id?: string
          share: number
          shipment_cost_id: string
          shipment_id: string
          shipment_line_id: string
          tenant_id: string
        }
        Update: {
          allocated_amount?: number
          basis_amount?: number
          costing_version?: number
          created_at?: string
          id?: string
          share?: number
          shipment_cost_id?: string
          shipment_id?: string
          shipment_line_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_cost_allocations_shipment_cost_id_fkey"
            columns: ["shipment_cost_id"]
            isOneToOne: false
            referencedRelation: "procurement_shipment_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_cost_allocations_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "procurement_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_cost_allocations_shipment_line_id_fkey"
            columns: ["shipment_line_id"]
            isOneToOne: false
            referencedRelation: "procurement_shipment_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_cost_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_landed_cost_lines: {
        Row: {
          costing_version: number
          created_at: string
          customs_amount: number
          freight_amount: number
          id: string
          invoice_amount: number
          is_approved: boolean
          landed_total: number
          other_amount: number
          shipment_id: string
          shipment_line_id: string
          tenant_id: string
          unit_landed_cost: number
        }
        Insert: {
          costing_version: number
          created_at?: string
          customs_amount?: number
          freight_amount?: number
          id?: string
          invoice_amount: number
          is_approved?: boolean
          landed_total: number
          other_amount?: number
          shipment_id: string
          shipment_line_id: string
          tenant_id: string
          unit_landed_cost: number
        }
        Update: {
          costing_version?: number
          created_at?: string
          customs_amount?: number
          freight_amount?: number
          id?: string
          invoice_amount?: number
          is_approved?: boolean
          landed_total?: number
          other_amount?: number
          shipment_id?: string
          shipment_line_id?: string
          tenant_id?: string
          unit_landed_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_landed_cost_lines_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "procurement_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_landed_cost_lines_shipment_line_id_fkey"
            columns: ["shipment_line_id"]
            isOneToOne: false
            referencedRelation: "procurement_shipment_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_landed_cost_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_receipt_lines: {
        Row: {
          id: string
          landed_total: number
          lot_no: string | null
          po_line_id: string
          product_id: string
          receipt_id: string
          received_qty: number
          shipment_line_id: string
          stock_movement_id: string | null
          unit_landed_cost: number
        }
        Insert: {
          id?: string
          landed_total: number
          lot_no?: string | null
          po_line_id: string
          product_id: string
          receipt_id: string
          received_qty: number
          shipment_line_id: string
          stock_movement_id?: string | null
          unit_landed_cost: number
        }
        Update: {
          id?: string
          landed_total?: number
          lot_no?: string | null
          po_line_id?: string
          product_id?: string
          receipt_id?: string
          received_qty?: number
          shipment_line_id?: string
          stock_movement_id?: string | null
          unit_landed_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_receipt_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_match"
            referencedColumns: ["po_line_id"]
          },
          {
            foreignKeyName: "procurement_receipt_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_receipt_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "procurement_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_receipt_lines_shipment_line_id_fkey"
            columns: ["shipment_line_id"]
            isOneToOne: true
            referencedRelation: "procurement_shipment_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_receipt_lines_stock_movement_id_fkey"
            columns: ["stock_movement_id"]
            isOneToOne: true
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          receipt_date: string
          receipt_no: string
          shipment_id: string
          tenant_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          receipt_date?: string
          receipt_no: string
          shipment_id: string
          tenant_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          receipt_date?: string
          receipt_no?: string
          shipment_id?: string
          tenant_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_receipts_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: true
            referencedRelation: "procurement_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_shipment_costs: {
        Row: {
          allocation_method: string
          amount: number
          amount_base: number | null
          cost_date: string
          cost_type: string
          created_at: string
          created_by: string | null
          currency: string
          direct_shipment_line_id: string | null
          document_no: string | null
          exchange_rate: number
          id: string
          manual_allocations: Json
          notes: string | null
          shipment_id: string
          tenant_id: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          allocation_method: string
          amount: number
          amount_base?: number | null
          cost_date?: string
          cost_type: string
          created_at?: string
          created_by?: string | null
          currency?: string
          direct_shipment_line_id?: string | null
          document_no?: string | null
          exchange_rate?: number
          id?: string
          manual_allocations?: Json
          notes?: string | null
          shipment_id: string
          tenant_id: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          allocation_method?: string
          amount?: number
          amount_base?: number | null
          cost_date?: string
          cost_type?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          direct_shipment_line_id?: string | null
          document_no?: string | null
          exchange_rate?: number
          id?: string
          manual_allocations?: Json
          notes?: string | null
          shipment_id?: string
          tenant_id?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_shipment_costs_direct_shipment_line_id_fkey"
            columns: ["direct_shipment_line_id"]
            isOneToOne: false
            referencedRelation: "procurement_shipment_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_shipment_costs_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "procurement_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_shipment_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_shipment_costs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_shipment_lines: {
        Row: {
          created_at: string
          duty_rate: number
          exchange_rate: number
          id: string
          invoice_amount_base: number | null
          invoice_unit_price: number
          lot_no: string | null
          po_line_id: string
          received_qty: number
          shipment_id: string
          shipped_qty: number
          tenant_id: string
          total_volume_m3: number
          total_weight_kg: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          duty_rate?: number
          exchange_rate?: number
          id?: string
          invoice_amount_base?: number | null
          invoice_unit_price: number
          lot_no?: string | null
          po_line_id: string
          received_qty?: number
          shipment_id: string
          shipped_qty: number
          tenant_id: string
          total_volume_m3?: number
          total_weight_kg?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          duty_rate?: number
          exchange_rate?: number
          id?: string
          invoice_amount_base?: number | null
          invoice_unit_price?: number
          lot_no?: string | null
          po_line_id?: string
          received_qty?: number
          shipment_id?: string
          shipped_qty?: number
          tenant_id?: string
          total_volume_m3?: number
          total_weight_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_shipment_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_match"
            referencedColumns: ["po_line_id"]
          },
          {
            foreignKeyName: "procurement_shipment_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_shipment_lines_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "procurement_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_shipment_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_shipments: {
        Row: {
          actual_arrival_date: string | null
          carrier: string | null
          container_no: string | null
          costing_approved_at: string | null
          costing_approved_by: string | null
          costing_version: number
          created_at: string
          created_by: string | null
          currency: string
          destination_country: string | null
          expected_arrival_date: string | null
          id: string
          notes: string | null
          origin_country: string | null
          received_at: string | null
          received_by: string | null
          shipment_date: string | null
          shipment_no: string
          status: string
          tenant_id: string
          transport_mode: string | null
          updated_at: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          actual_arrival_date?: string | null
          carrier?: string | null
          container_no?: string | null
          costing_approved_at?: string | null
          costing_approved_by?: string | null
          costing_version?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          destination_country?: string | null
          expected_arrival_date?: string | null
          id?: string
          notes?: string | null
          origin_country?: string | null
          received_at?: string | null
          received_by?: string | null
          shipment_date?: string | null
          shipment_no: string
          status?: string
          tenant_id: string
          transport_mode?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          actual_arrival_date?: string | null
          carrier?: string | null
          container_no?: string | null
          costing_approved_at?: string | null
          costing_approved_by?: string | null
          costing_version?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          destination_country?: string | null
          expected_arrival_date?: string | null
          id?: string
          notes?: string | null
          origin_country?: string | null
          received_at?: string | null
          received_by?: string | null
          shipment_date?: string | null
          shipment_no?: string
          status?: string
          tenant_id?: string
          transport_mode?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_shipments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          sku: string
          tenant_id: string
          unit: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sku: string
          tenant_id: string
          unit?: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sku?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_tenant_id: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: number
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          description: string | null
          duty_rate: number
          hs_code: string | null
          id: string
          line_no: number
          po_id: string
          product_id: string | null
          product_sku: string
          qty_ordered: number
          tax_rate: number
          unit: string
          unit_gross_weight_kg: number
          unit_net_weight_kg: number
          unit_price: number
          unit_volume_m3: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duty_rate?: number
          hs_code?: string | null
          id?: string
          line_no: number
          po_id: string
          product_id?: string | null
          product_sku: string
          qty_ordered: number
          tax_rate?: number
          unit?: string
          unit_gross_weight_kg?: number
          unit_net_weight_kg?: number
          unit_price: number
          unit_volume_m3?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duty_rate?: number
          hs_code?: string | null
          id?: string
          line_no?: number
          po_id?: string
          product_id?: string | null
          product_sku?: string
          qty_ordered?: number
          tax_rate?: number
          unit?: string
          unit_gross_weight_kg?: number
          unit_net_weight_kg?: number
          unit_price?: number
          unit_volume_m3?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_line_match"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          exchange_rate: number
          expected_date: string | null
          factory_name: string | null
          id: string
          notes: string | null
          order_date: string
          payment_terms: string | null
          po_number: string
          status: Database["public"]["Enums"]["po_status"]
          tenant_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          expected_date?: string | null
          factory_name?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          payment_terms?: string | null
          po_number: string
          status?: Database["public"]["Enums"]["po_status"]
          tenant_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          expected_date?: string | null
          factory_name?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          payment_terms?: string | null
          po_number?: string
          status?: Database["public"]["Enums"]["po_status"]
          tenant_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          id: string
          line_total: number
          product_id: string | null
          qty: number
          quote_id: string
          sort_order: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_pct?: number
          id?: string
          line_total?: number
          product_id?: string | null
          qty?: number
          quote_id: string
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          line_total?: number
          product_id?: string | null
          qty?: number
          quote_id?: string
          sort_order?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          currency: string
          customer_id: string | null
          discount_total: number
          id: string
          notes: string | null
          number: string
          order_id: string | null
          owner_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_total?: number
          id?: string
          notes?: string | null
          number: string
          order_id?: string | null
          owner_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_total?: number
          id?: string
          notes?: string | null
          number?: string
          order_id?: string | null
          owner_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_lines: {
        Row: {
          created_at: string
          id: string
          ledger_transaction_id: string | null
          matched_at: string | null
          matched_by: string | null
          note: string | null
          reconciliation_id: string
          statement_amount: number
          statement_date: string | null
          statement_reference: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ledger_transaction_id?: string | null
          matched_at?: string | null
          matched_by?: string | null
          note?: string | null
          reconciliation_id: string
          statement_amount?: number
          statement_date?: string | null
          statement_reference?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ledger_transaction_id?: string | null
          matched_at?: string | null
          matched_by?: string | null
          note?: string | null
          reconciliation_id?: string
          statement_amount?: number
          statement_date?: string | null
          statement_reference?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_lines_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_lines_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      sales_invoice_lines: {
        Row: {
          created_at: string
          description: string | null
          discount_pct: number
          id: string
          invoice_id: string
          line_no: number
          line_total: number
          product_id: string | null
          qty: number
          tenant_id: string
          unit_price: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_pct?: number
          id?: string
          invoice_id: string
          line_no?: number
          line_total?: number
          product_id?: string | null
          qty?: number
          tenant_id: string
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_pct?: number
          id?: string
          invoice_id?: string
          line_no?: number
          line_total?: number
          product_id?: string | null
          qty?: number
          tenant_id?: string
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          discount_total: number
          due_date: string | null
          id: string
          invoice_date: string
          invoice_no: string
          journal_entry_id: string | null
          notes: string | null
          order_id: string | null
          paid_amount: number
          posted: boolean
          status: Database["public"]["Enums"]["sales_invoice_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat_total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no: string
          journal_entry_id?: string | null
          notes?: string | null
          order_id?: string | null
          paid_amount?: number
          posted?: boolean
          status?: Database["public"]["Enums"]["sales_invoice_status"]
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
          vat_total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          journal_entry_id?: string | null
          notes?: string | null
          order_id?: string | null
          paid_amount?: number
          posted?: boolean
          status?: Database["public"]["Enums"]["sales_invoice_status"]
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_shipment_items: {
        Row: {
          created_at: string
          id: string
          order_item_id: string
          qty_shipped: number
          shipment_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_item_id: string
          qty_shipped?: number
          shipment_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_item_id?: string
          qty_shipped?: number
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "sales_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_shipments: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_id: string
          shipment_no: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["shipment_status"]
          tenant_id: string
          tracking_no: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          shipment_no: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tenant_id: string
          tracking_no?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          shipment_no?: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tenant_id?: string
          tracking_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_balances: {
        Row: {
          avg_cost: number
          id: string
          product_id: string | null
          qty: number
          reorder_point: number
          sku: string | null
          tenant_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          avg_cost?: number
          id?: string
          product_id?: string | null
          qty?: number
          reorder_point?: number
          sku?: string | null
          tenant_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          avg_cost?: number
          id?: string
          product_id?: string | null
          qty?: number
          reorder_point?: number
          sku?: string | null
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          doc_no: string | null
          id: string
          move_type: Database["public"]["Enums"]["stock_move_type"]
          moved_at: string
          note: string | null
          product_id: string | null
          qty: number
          reference: string | null
          sku: string | null
          tenant_id: string
          unit_cost: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_no?: string | null
          id?: string
          move_type: Database["public"]["Enums"]["stock_move_type"]
          moved_at?: string
          note?: string | null
          product_id?: string | null
          qty: number
          reference?: string | null
          sku?: string | null
          tenant_id: string
          unit_cost?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_no?: string | null
          id?: string
          move_type?: Database["public"]["Enums"]["stock_move_type"]
          moved_at?: string
          note?: string | null
          product_id?: string | null
          qty?: number
          reference?: string | null
          sku?: string | null
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_limits: {
        Row: {
          enabled_modules: string[]
          max_storage_mb: number
          max_users: number
          max_warehouses: number
          security_policy: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled_modules?: string[]
          max_storage_mb?: number
          max_users?: number
          max_warehouses?: number
          security_policy?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled_modules?: string[]
          max_storage_mb?: number
          max_users?: number
          max_warehouses?: number
          security_policy?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_modules: {
        Row: {
          module: string
          tenant_id: string
        }
        Insert: {
          module: string
          tenant_id: string
        }
        Update: {
          module?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_state_snapshots: {
        Row: {
          created_at: string
          schema_version: number
          state: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          schema_version?: number
          state?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          schema_version?: number
          state?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_state_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_at: string | null
          frozen_at: string | null
          id: string
          max_users: number
          name: string
          notes: string | null
          plan_name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          expires_at?: string | null
          frozen_at?: string | null
          id?: string
          max_users?: number
          name: string
          notes?: string | null
          plan_name?: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          expires_at?: string | null
          frozen_at?: string | null
          id?: string
          max_users?: number
          name?: string
          notes?: string | null
          plan_name?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Relationships: []
      }
      vendor_invoice_lines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          po_line_id: string | null
          qty_invoiced: number
          tax_rate: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          po_line_id?: string | null
          qty_invoiced: number
          tax_rate?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          po_line_id?: string | null
          qty_invoiced?: number
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vendor_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoice_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "po_line_match"
            referencedColumns: ["po_line_id"]
          },
          {
            foreignKeyName: "vendor_invoice_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          match_notes: string | null
          po_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          match_notes?: string | null
          po_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          match_notes?: string | null
          po_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tenant_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_line_match"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "vendor_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_approvals: {
        Row: {
          approver_id: string | null
          comment: string | null
          created_at: string
          decided_at: string | null
          id: string
          role_code: string | null
          status: string
          step_no: number
          tenant_id: string
          workflow_id: string
        }
        Insert: {
          approver_id?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          role_code?: string | null
          status?: string
          step_no: number
          tenant_id: string
          workflow_id: string
        }
        Update: {
          approver_id?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          role_code?: string | null
          status?: string
          step_no?: number
          tenant_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_approvals_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_records"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          line_no: number
          payload: Json
          product_id: string | null
          quantity: number
          tax_rate: number
          tenant_id: string
          unit_price: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          line_no: number
          payload?: Json
          product_id?: string | null
          quantity?: number
          tax_rate?: number
          tenant_id: string
          unit_price?: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_no?: number
          payload?: Json
          product_id?: string | null
          quantity?: number
          tax_rate?: number
          tenant_id?: string
          unit_price?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_lines_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_records"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_records: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          created_by: string
          currency: string
          due_at: string | null
          id: string
          module: string
          owner_id: string | null
          parent_id: string | null
          parent_type: string | null
          party_id: string | null
          party_type: string | null
          payload: Json
          record_no: string
          record_type: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          due_at?: string | null
          id?: string
          module: string
          owner_id?: string | null
          parent_id?: string | null
          parent_type?: string | null
          party_id?: string | null
          party_type?: string | null
          payload?: Json
          record_no: string
          record_type: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          due_at?: string | null
          id?: string
          module?: string
          owner_id?: string | null
          parent_id?: string | null
          parent_type?: string | null
          party_id?: string | null
          party_type?: string | null
          payload?: Json
          record_no?: string
          record_type?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      po_line_match: {
        Row: {
          avg_invoice_price: number | null
          line_no: number | null
          po_id: string | null
          po_line_id: string | null
          po_number: string | null
          po_unit_price: number | null
          product_sku: string | null
          qty_accepted: number | null
          qty_invoiced: number | null
          qty_ordered: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_tenant_invite: { Args: { _token: string }; Returns: string }
      apply_invoice_match: {
        Args: {
          _invoice_id: string
          _price_tolerance?: number
          _qty_tolerance?: number
        }
        Returns: Database["public"]["Enums"]["invoice_status"]
      }
      check_my_access: { Args: never; Returns: Json }
      check_project_access: { Args: { _project: string }; Returns: Json }
      convert_quote_to_order: { Args: { _quote_id: string }; Returns: string }
      create_tenant: { Args: { _name: string; _slug: string }; Returns: string }
      crm_pipeline_summary: {
        Args: { _pipeline: string }
        Returns: {
          color: string
          deal_count: number
          sort_order: number
          stage_id: string
          stage_name: string
          total_amount: number
        }[]
      }
      customer_360: { Args: { _customer: string }; Returns: Json }
      customer_360_snapshot: {
        Args: { _customer_id: string; _tenant_id: string }
        Returns: Json
      }
      ensure_rls_helper_grants: { Args: never; Returns: Json }
      evaluate_invoice_match: {
        Args: {
          _invoice_id: string
          _price_tolerance?: number
          _qty_tolerance?: number
        }
        Returns: {
          invoice_unit_price: number
          line_no: number
          po_line_id: string
          po_unit_price: number
          price_ok: boolean
          product_sku: string
          qty_accepted: number
          qty_invoiced: number
          qty_ok: boolean
          qty_ordered: number
          status: string
        }[]
      }
      generate_doc_number: {
        Args: {
          _column: string
          _prefix: string
          _table: string
          _tenant: string
        }
        Returns: string
      }
      get_exchange_rate: {
        Args: { _code: string; _on_date?: string; _tenant: string }
        Returns: number
      }
      gl_account_by_code: {
        Args: { _code: string; _tenant: string }
        Returns: string
      }
      is_period_locked: {
        Args: { _date: string; _tenant: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user: string }; Returns: boolean }
      is_tenant_admin: {
        Args: { _tenant: string; _user: string }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant: string; _user: string }
        Returns: boolean
      }
      mark_sales_order_delivered: {
        Args: { _order_id: string }
        Returns: undefined
      }
      platform_bootstrap_admin: { Args: never; Returns: boolean }
      platform_create_tenant: {
        Args: {
          _admin_email?: string
          _expires_at?: string
          _max_users?: number
          _modules?: string[]
          _name: string
          _notes?: string
          _plan?: string
          _slug: string
        }
        Returns: string
      }
      platform_delete_tenant: { Args: { _tenant: string }; Returns: undefined }
      platform_health_check: { Args: never; Returns: Json }
      platform_list_tenants: {
        Args: never
        Returns: {
          created_at: string
          deleted_at: string
          expires_at: string
          frozen_at: string
          id: string
          max_users: number
          member_count: number
          modules: string[]
          name: string
          notes: string
          plan_name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
        }[]
      }
      platform_set_tenant_limits: {
        Args: {
          _enabled_modules?: string[]
          _max_storage_mb?: number
          _max_users: number
          _max_warehouses?: number
          _tenant: string
        }
        Returns: {
          enabled_modules: string[]
          max_storage_mb: number
          max_users: number
          max_warehouses: number
          security_policy: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenant_limits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_set_tenant_modules: {
        Args: { _modules: string[]; _tenant: string }
        Returns: undefined
      }
      platform_set_tenant_status: {
        Args: {
          _status: Database["public"]["Enums"]["tenant_status"]
          _tenant: string
        }
        Returns: undefined
      }
      platform_tenant_usage: {
        Args: never
        Returns: {
          enabled_modules: string[]
          max_storage_mb: number
          max_users: number
          max_warehouses: number
          member_count: number
          tenant_id: string
          tenant_name: string
          tenant_status: string
          warehouse_count: number
        }[]
      }
      platform_update_tenant: {
        Args: {
          _expires_at?: string
          _max_users?: number
          _name?: string
          _notes?: string
          _plan?: string
          _tenant: string
        }
        Returns: undefined
      }
      post_invoice_to_gl: { Args: { _invoice_id: string }; Returns: string }
      post_payment_to_gl: { Args: { _payment_id: string }; Returns: string }
      recalculate_shipment_landed_cost: {
        Args: { _approve?: boolean; _shipment: string }
        Returns: number
      }
      receive_landed_cost_shipment: {
        Args: { _receipt_date?: string; _shipment: string; _warehouse: string }
        Returns: string
      }
      refresh_credit_overdue: {
        Args: { _as_of?: string; _tenant_id: string }
        Returns: {
          overdue_contracts: number
          updated_installments: number
        }[]
      }
      sales_dashboard: {
        Args: { _from: string; _tenant: string; _to: string }
        Returns: Json
      }
      seed_default_coa: { Args: { _tenant: string }; Returns: undefined }
      seed_default_crm_pipeline: { Args: { _tenant: string }; Returns: string }
      trial_balance: {
        Args: { _from: string; _tenant: string; _to: string }
        Returns: {
          account_id: string
          balance: number
          code: string
          credit: number
          debit: number
          name: string
          type: Database["public"]["Enums"]["account_type"]
        }[]
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      app_role: "owner" | "admin" | "member" | "viewer"
      cash_account_type: "cash" | "bank" | "card" | "other"
      cash_direction: "in" | "out"
      invoice_status:
        | "draft"
        | "matched"
        | "exception"
        | "approved"
        | "paid"
        | "cancelled"
      order_status:
        | "draft"
        | "confirmed"
        | "shipped"
        | "delivered"
        | "cancelled"
      payment_status: "unpaid" | "partial" | "paid" | "refunded"
      po_status:
        | "draft"
        | "approved"
        | "partial"
        | "received"
        | "closed"
        | "cancelled"
      quote_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      sales_invoice_status:
        | "draft"
        | "issued"
        | "partial"
        | "paid"
        | "overdue"
        | "cancelled"
      shipment_status:
        | "pending"
        | "packed"
        | "shipped"
        | "delivered"
        | "cancelled"
      stock_move_type: "in" | "out" | "adjust" | "transfer"
      tenant_status: "active" | "frozen" | "deleted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      app_role: ["owner", "admin", "member", "viewer"],
      cash_account_type: ["cash", "bank", "card", "other"],
      cash_direction: ["in", "out"],
      invoice_status: [
        "draft",
        "matched",
        "exception",
        "approved",
        "paid",
        "cancelled",
      ],
      order_status: ["draft", "confirmed", "shipped", "delivered", "cancelled"],
      payment_status: ["unpaid", "partial", "paid", "refunded"],
      po_status: [
        "draft",
        "approved",
        "partial",
        "received",
        "closed",
        "cancelled",
      ],
      quote_status: ["draft", "sent", "accepted", "rejected", "expired"],
      sales_invoice_status: [
        "draft",
        "issued",
        "partial",
        "paid",
        "overdue",
        "cancelled",
      ],
      shipment_status: [
        "pending",
        "packed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      stock_move_type: ["in", "out", "adjust", "transfer"],
      tenant_status: ["active", "frozen", "deleted"],
    },
  },
} as const
