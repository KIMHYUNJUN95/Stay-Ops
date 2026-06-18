export type Json =
  | boolean
  | null
  | number
  | string
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      attendance_sites: {
        Insert: {
          allowed_radius_meters?: number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          latitude: number;
          longitude: number;
          name: string;
          organization_id: string;
          property_id?: string | null;
          updated_at?: string;
          wifi_ssids?: string[];
        };
        Row: {
          allowed_radius_meters: number;
          created_at: string;
          id: string;
          is_active: boolean;
          latitude: number;
          longitude: number;
          name: string;
          organization_id: string;
          property_id: string | null;
          updated_at: string;
          wifi_ssids: string[];
        };
        Update: {
          allowed_radius_meters?: number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          latitude?: number;
          longitude?: number;
          name?: string;
          organization_id?: string;
          property_id?: string | null;
          updated_at?: string;
          wifi_ssids?: string[];
        };
      };
      attendance_open_session_reminders: {
        Insert: {
          created_at?: string;
          id?: string;
          operating_date: string;
          organization_id: string;
          responded_at?: string | null;
          response?: string | null;
          user_id: string;
        };
        Row: {
          created_at: string;
          id: string;
          operating_date: string;
          organization_id: string;
          responded_at: string | null;
          response: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          operating_date?: string;
          organization_id?: string;
          responded_at?: string | null;
          response?: string | null;
          user_id?: string;
        };
      };
      attendance_qr_tokens: {
        Insert: {
          created_at?: string;
          created_by_user_id: string;
          id?: string;
          is_active?: boolean;
          issued_at?: string;
          organization_id: string;
          replaced_by_token_id?: string | null;
          revoked_at?: string | null;
          site_id: string;
          token: string;
        };
        Row: {
          created_at: string;
          created_by_user_id: string;
          id: string;
          is_active: boolean;
          issued_at: string;
          organization_id: string;
          replaced_by_token_id: string | null;
          revoked_at: string | null;
          site_id: string;
          token: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string;
          id?: string;
          is_active?: boolean;
          issued_at?: string;
          organization_id?: string;
          replaced_by_token_id?: string | null;
          revoked_at?: string | null;
          site_id?: string;
          token?: string;
        };
      };
      attendance_sessions: {
        Insert: {
          clock_in_accuracy_meters?: number | null;
          clock_in_at?: string | null;
          clock_in_device_info?: Json;
          clock_in_latitude?: number | null;
          clock_in_longitude?: number | null;
          clock_in_method?: string | null;
          clock_in_qr_token_id?: string | null;
          clock_in_site_id?: string | null;
          clock_out_accuracy_meters?: number | null;
          clock_out_at?: string | null;
          clock_out_device_info?: Json;
          clock_out_latitude?: number | null;
          clock_out_longitude?: number | null;
          clock_out_method?: string | null;
          clock_out_qr_token_id?: string | null;
          clock_out_site_id?: string | null;
          created_at?: string;
          id?: string;
          invalidated_at?: string | null;
          invalidated_by_user_id?: string | null;
          invalidated_reason?: string | null;
          manual_created?: boolean;
          manual_created_by_user_id?: string | null;
          manual_created_reason?: string | null;
          operating_date: string;
          organization_id: string;
          review_state?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Row: {
          clock_in_accuracy_meters: number | null;
          clock_in_at: string | null;
          clock_in_device_info: Json;
          clock_in_latitude: number | null;
          clock_in_longitude: number | null;
          clock_in_method: string | null;
          clock_in_qr_token_id: string | null;
          clock_in_site_id: string | null;
          clock_out_accuracy_meters: number | null;
          clock_out_at: string | null;
          clock_out_device_info: Json;
          clock_out_latitude: number | null;
          clock_out_longitude: number | null;
          clock_out_method: string | null;
          clock_out_qr_token_id: string | null;
          clock_out_site_id: string | null;
          created_at: string;
          id: string;
          invalidated_at: string | null;
          invalidated_by_user_id: string | null;
          invalidated_reason: string | null;
          manual_created: boolean;
          manual_created_by_user_id: string | null;
          manual_created_reason: string | null;
          operating_date: string;
          organization_id: string;
          review_state: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Update: {
          clock_in_accuracy_meters?: number | null;
          clock_in_at?: string | null;
          clock_in_device_info?: Json;
          clock_in_latitude?: number | null;
          clock_in_longitude?: number | null;
          clock_in_method?: string | null;
          clock_in_qr_token_id?: string | null;
          clock_in_site_id?: string | null;
          clock_out_accuracy_meters?: number | null;
          clock_out_at?: string | null;
          clock_out_device_info?: Json;
          clock_out_latitude?: number | null;
          clock_out_longitude?: number | null;
          clock_out_method?: string | null;
          clock_out_qr_token_id?: string | null;
          clock_out_site_id?: string | null;
          created_at?: string;
          id?: string;
          invalidated_at?: string | null;
          invalidated_by_user_id?: string | null;
          invalidated_reason?: string | null;
          manual_created?: boolean;
          manual_created_by_user_id?: string | null;
          manual_created_reason?: string | null;
          operating_date?: string;
          organization_id?: string;
          review_state?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
      };
      attendance_breaks: {
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          organization_id: string;
          session_id: string;
          started_at: string;
          updated_at?: string;
        };
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
          organization_id: string;
          session_id: string;
          started_at: string;
          updated_at: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          organization_id?: string;
          session_id?: string;
          started_at?: string;
          updated_at?: string;
        };
      };
      attendance_attempt_logs: {
        Insert: {
          accuracy_meters?: number | null;
          action_type: string;
          attempted_at?: string;
          created_at?: string;
          device_info?: Json;
          failure_reason?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          method: string;
          organization_id: string;
          resolved_site_id?: string | null;
          success: boolean;
          user_id: string;
        };
        Row: {
          accuracy_meters: number | null;
          action_type: string;
          attempted_at: string;
          created_at: string;
          device_info: Json;
          failure_reason: string | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          method: string;
          organization_id: string;
          resolved_site_id: string | null;
          success: boolean;
          user_id: string;
        };
        Update: {
          accuracy_meters?: number | null;
          action_type?: string;
          attempted_at?: string;
          created_at?: string;
          device_info?: Json;
          failure_reason?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          method?: string;
          organization_id?: string;
          resolved_site_id?: string | null;
          success?: boolean;
          user_id?: string;
        };
      };
      attendance_correction_requests: {
        Insert: {
          created_at?: string;
          desired_clock_in_at?: string | null;
          desired_clock_in_site_id?: string | null;
          desired_clock_out_at?: string | null;
          desired_clock_out_site_id?: string | null;
          id?: string;
          image_urls?: string[];
          memo?: string | null;
          organization_id: string;
          reason_type: string;
          requested_by_user_id: string;
          review_comment?: string | null;
          reviewed_at?: string | null;
          reviewed_by_user_id?: string | null;
          session_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Row: {
          created_at: string;
          desired_clock_in_at: string | null;
          desired_clock_in_site_id: string | null;
          desired_clock_out_at: string | null;
          desired_clock_out_site_id: string | null;
          id: string;
          image_urls: string[];
          memo: string | null;
          organization_id: string;
          reason_type: string;
          requested_by_user_id: string;
          review_comment: string | null;
          reviewed_at: string | null;
          reviewed_by_user_id: string | null;
          session_id: string | null;
          status: string;
          updated_at: string;
        };
        Update: {
          created_at?: string;
          desired_clock_in_at?: string | null;
          desired_clock_in_site_id?: string | null;
          desired_clock_out_at?: string | null;
          desired_clock_out_site_id?: string | null;
          id?: string;
          image_urls?: string[];
          memo?: string | null;
          organization_id?: string;
          reason_type?: string;
          requested_by_user_id?: string;
          review_comment?: string | null;
          reviewed_at?: string | null;
          reviewed_by_user_id?: string | null;
          session_id?: string | null;
          status?: string;
          updated_at?: string;
        };
      };
      attendance_session_audits: {
        Insert: {
          action_type: string;
          actor_user_id: string;
          after_json?: Json;
          before_json?: Json;
          created_at?: string;
          id?: string;
          organization_id: string;
          reason: string;
          session_id: string;
        };
        Row: {
          action_type: string;
          actor_user_id: string;
          after_json: Json;
          before_json: Json;
          created_at: string;
          id: string;
          organization_id: string;
          reason: string;
          session_id: string;
        };
        Update: {
          action_type?: string;
          actor_user_id?: string;
          after_json?: Json;
          before_json?: Json;
          created_at?: string;
          id?: string;
          organization_id?: string;
          reason?: string;
          session_id?: string;
        };
      };
      employment_type_history: {
        Insert: {
          created_at?: string;
          created_by_user_id: string;
          effective_from: string;
          effective_to?: string | null;
          employment_type: string;
          id?: string;
          organization_id: string;
          user_id: string;
        };
        Row: {
          created_at: string;
          created_by_user_id: string;
          effective_from: string;
          effective_to: string | null;
          employment_type: string;
          id: string;
          organization_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string;
          effective_from?: string;
          effective_to?: string | null;
          employment_type?: string;
          id?: string;
          organization_id?: string;
          user_id?: string;
        };
      };
      hourly_rate_history: {
        Insert: {
          created_at?: string;
          created_by_user_id: string;
          effective_from: string;
          effective_to?: string | null;
          hourly_rate: number;
          id?: string;
          organization_id: string;
          user_id: string;
        };
        Row: {
          created_at: string;
          created_by_user_id: string;
          effective_from: string;
          effective_to: string | null;
          hourly_rate: number;
          id: string;
          organization_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string;
          effective_from?: string;
          effective_to?: string | null;
          hourly_rate?: number;
          id?: string;
          organization_id?: string;
          user_id?: string;
        };
      };
      attendance_month_snapshots: {
        Insert: {
          created_at?: string;
          finalized_at?: string | null;
          finalized_by_user_id?: string | null;
          gross_amount?: number;
          id?: string;
          organization_id: string;
          rate_breakdown?: Json;
          status?: string;
          supersedes_snapshot_id?: string | null;
          target_month: string;
          total_paid_minutes?: number;
          updated_at?: string;
          user_id: string;
        };
        Row: {
          created_at: string;
          finalized_at: string | null;
          finalized_by_user_id: string | null;
          gross_amount: number;
          id: string;
          organization_id: string;
          rate_breakdown: Json;
          status: string;
          supersedes_snapshot_id: string | null;
          target_month: string;
          total_paid_minutes: number;
          updated_at: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          finalized_at?: string | null;
          finalized_by_user_id?: string | null;
          gross_amount?: number;
          id?: string;
          organization_id?: string;
          rate_breakdown?: Json;
          status?: string;
          supersedes_snapshot_id?: string | null;
          target_month?: string;
          total_paid_minutes?: number;
          updated_at?: string;
          user_id?: string;
        };
      };
      attendance_export_logs: {
        Insert: {
          created_at?: string;
          export_scope: string;
          exported_by_user_id: string;
          id?: string;
          meta?: Json;
          organization_id: string;
          snapshot_ids?: string[];
          target_month: string;
          user_id?: string | null;
        };
        Row: {
          created_at: string;
          export_scope: string;
          exported_by_user_id: string;
          id: string;
          meta: Json;
          organization_id: string;
          snapshot_ids: string[];
          target_month: string;
          user_id: string | null;
        };
        Update: {
          created_at?: string;
          export_scope?: string;
          exported_by_user_id?: string;
          id?: string;
          meta?: Json;
          organization_id?: string;
          snapshot_ids?: string[];
          target_month?: string;
          user_id?: string | null;
        };
      };
      tasks: {
        Insert: {
          all_day?: boolean;
          completed_at?: string | null;
          completed_by_user_id?: string | null;
          created_at?: string;
          created_by_user_id: string;
          description?: string | null;
          due_at?: string | null;
          guest_name?: string | null;
          id?: string;
          image_urls?: string[];
          is_inbox?: boolean;
          is_shared?: boolean;
          organization_id: string;
          priority?: string;
          project_id?: string | null;
          property_id?: string | null;
          recurrence_rule?: string | null;
          recurrence_series_id?: string | null;
          recurrence_instance_date?: string | null;
          reservation_id?: string | null;
          room_id?: string | null;
          scheduled_date?: string | null;
          section_id?: string | null;
          sort_order?: number | null;
          status?: string;
          tags?: string[];
          time_label?: string | null;
          title: string;
          updated_at?: string;
        };
        Row: {
          all_day: boolean;
          completed_at: string | null;
          completed_by_user_id: string | null;
          created_at: string;
          created_by_user_id: string;
          description: string | null;
          due_at: string | null;
          guest_name: string | null;
          id: string;
          image_urls: string[];
          is_inbox: boolean;
          is_shared: boolean;
          organization_id: string;
          priority: string;
          project_id: string | null;
          property_id: string | null;
          recurrence_rule: string | null;
          recurrence_series_id: string | null;
          recurrence_instance_date: string | null;
          reservation_id: string | null;
          room_id: string | null;
          scheduled_date: string | null;
          section_id: string | null;
          sort_order: number | null;
          status: string;
          tags: string[];
          time_label: string | null;
          title: string;
          updated_at: string;
        };
        Update: {
          all_day?: boolean;
          completed_at?: string | null;
          completed_by_user_id?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          description?: string | null;
          due_at?: string | null;
          guest_name?: string | null;
          id?: string;
          image_urls?: string[];
          is_inbox?: boolean;
          is_shared?: boolean;
          organization_id?: string;
          priority?: string;
          project_id?: string | null;
          property_id?: string | null;
          recurrence_rule?: string | null;
          recurrence_series_id?: string | null;
          recurrence_instance_date?: string | null;
          reservation_id?: string | null;
          room_id?: string | null;
          scheduled_date?: string | null;
          section_id?: string | null;
          sort_order?: number | null;
          status?: string;
          tags?: string[];
          time_label?: string | null;
          title?: string;
          updated_at?: string;
        };
      };
      projects: {
        Insert: {
          created_at?: string;
          created_by_user_id: string;
          description?: string | null;
          id?: string;
          is_shared?: boolean;
          organization_id: string;
          sort_order?: number | null;
          title: string;
          updated_at?: string;
        };
        Row: {
          created_at: string;
          created_by_user_id: string;
          description: string | null;
          id: string;
          is_shared: boolean;
          organization_id: string;
          sort_order: number | null;
          title: string;
          updated_at: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string;
          description?: string | null;
          id?: string;
          is_shared?: boolean;
          organization_id?: string;
          sort_order?: number | null;
          title?: string;
          updated_at?: string;
        };
      };
      project_participants: {
        Insert: {
          added_by_user_id?: string | null;
          created_at?: string;
          id?: string;
          is_first_recipient?: boolean;
          project_id: string;
          role: string;
          user_id: string;
        };
        Row: {
          added_by_user_id: string | null;
          created_at: string;
          id: string;
          is_first_recipient: boolean;
          project_id: string;
          role: string;
          user_id: string;
        };
        Update: {
          added_by_user_id?: string | null;
          created_at?: string;
          id?: string;
          is_first_recipient?: boolean;
          project_id?: string;
          role?: string;
          user_id?: string;
        };
      };
      project_sections: {
        Insert: {
          created_at?: string;
          id?: string;
          project_id: string;
          sort_order?: number | null;
          title: string;
          updated_at?: string;
        };
        Row: {
          created_at: string;
          id: string;
          project_id: string;
          sort_order: number | null;
          title: string;
          updated_at: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          project_id?: string;
          sort_order?: number | null;
          title?: string;
          updated_at?: string;
        };
      };
      staff_suggestions: {
        Insert: {
          body: string;
          category?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by_user_id: string;
          hold_reason?: string | null;
          id?: string;
          image_urls?: string[];
          organization_id: string;
          property_id?: string | null;
          property_name?: string | null;
          recipient_user_id: string;
          room_id?: string | null;
          room_label?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Row: {
          body: string;
          category: string | null;
          completion_note: string | null;
          created_at: string;
          created_by_user_id: string;
          hold_reason: string | null;
          id: string;
          image_urls: string[];
          organization_id: string;
          property_id: string | null;
          property_name: string | null;
          recipient_user_id: string;
          room_id: string | null;
          room_label: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Update: {
          body?: string;
          category?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          hold_reason?: string | null;
          id?: string;
          image_urls?: string[];
          organization_id?: string;
          property_id?: string | null;
          property_name?: string | null;
          recipient_user_id?: string;
          room_id?: string | null;
          room_label?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
      };
      staff_suggestion_references: {
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          suggestion_id: string;
          user_id: string;
        };
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          suggestion_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          suggestion_id?: string;
          user_id?: string;
        };
      };
      staff_suggestion_events: {
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          status: string;
          suggestion_id: string;
        };
        Row: {
          actor_user_id: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          status: string;
          suggestion_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          status?: string;
          suggestion_id?: string;
        };
      };
      staff_suggestion_comments: {
        Insert: {
          body?: string | null;
          created_at?: string;
          created_by_user_id: string;
          id?: string;
          image_urls?: string[];
          organization_id: string;
          suggestion_id: string;
          updated_at?: string;
        };
        Row: {
          body: string | null;
          created_at: string;
          created_by_user_id: string;
          id: string;
          image_urls: string[];
          organization_id: string;
          suggestion_id: string;
          updated_at: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          id?: string;
          image_urls?: string[];
          organization_id?: string;
          suggestion_id?: string;
          updated_at?: string;
        };
      };
      task_participants: {
        Insert: {
          added_by_user_id?: string | null;
          created_at?: string;
          id?: string;
          is_first_recipient?: boolean;
          role: string;
          task_id: string;
          user_id: string;
        };
        Row: {
          added_by_user_id: string | null;
          created_at: string;
          id: string;
          is_first_recipient: boolean;
          role: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          added_by_user_id?: string | null;
          created_at?: string;
          id?: string;
          is_first_recipient?: boolean;
          role?: string;
          task_id?: string;
          user_id?: string;
        };
      };
      task_updates: {
        Insert: {
          body?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          image_urls?: string[];
          task_id: string;
          update_type: string;
        };
        Row: {
          body: string | null;
          created_at: string;
          created_by_user_id: string | null;
          id: string;
          image_urls: string[];
          task_id: string;
          update_type: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          image_urls?: string[];
          task_id?: string;
          update_type?: string;
        };
      };
      beds24_webhook_events: {
        Insert: {
          booking_summary?: Json;
          created_at?: string;
          error_message?: string | null;
          failed_count?: number;
          http_status?: number | null;
          id?: string;
          modes?: string[];
          organization_id?: string | null;
          processed_count?: number;
          received_at?: string;
          succeeded_count?: number;
          trigger_source?: string;
        };
        Row: {
          booking_summary: Json;
          created_at: string;
          error_message: string | null;
          failed_count: number;
          http_status: number | null;
          id: string;
          modes: string[];
          organization_id: string | null;
          processed_count: number;
          received_at: string;
          succeeded_count: number;
          trigger_source: string;
        };
        Update: {
          booking_summary?: Json;
          created_at?: string;
          error_message?: string | null;
          failed_count?: number;
          http_status?: number | null;
          id?: string;
          modes?: string[];
          organization_id?: string | null;
          processed_count?: number;
          received_at?: string;
          succeeded_count?: number;
          trigger_source?: string;
        };
      };
      audit_logs: {
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          organization_id: string | null;
          target_id: string | null;
          target_type: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
          target_id?: string | null;
          target_type?: string | null;
        };
      };
      announcements: {
        Insert: {
          allow_comments?: boolean;
          archived_at?: string | null;
          content: string;
          created_at?: string;
          created_by_user_id: string;
          id?: string;
          image_urls?: string[];
          is_important?: boolean;
          is_pinned?: boolean;
          organization_id: string;
          popup_until?: string | null;
          published_at?: string | null;
          show_popup_on_app_open?: boolean;
          status?: Database["public"]["Enums"]["announcement_status"];
          target_roles?: Database["public"]["Enums"]["organization_role"][];
          target_scope?: Database["public"]["Enums"]["announcement_target_scope"];
          title: string;
          updated_at?: string;
        };
        Row: {
          allow_comments: boolean;
          archived_at: string | null;
          content: string;
          created_at: string;
          created_by_user_id: string;
          id: string;
          image_urls: string[];
          is_important: boolean;
          is_pinned: boolean;
          organization_id: string;
          popup_until: string | null;
          published_at: string | null;
          show_popup_on_app_open: boolean;
          status: Database["public"]["Enums"]["announcement_status"];
          target_roles: Database["public"]["Enums"]["organization_role"][];
          target_scope: Database["public"]["Enums"]["announcement_target_scope"];
          title: string;
          updated_at: string;
        };
        Update: {
          allow_comments?: boolean;
          archived_at?: string | null;
          content?: string;
          created_at?: string;
          created_by_user_id?: string;
          id?: string;
          image_urls?: string[];
          is_important?: boolean;
          is_pinned?: boolean;
          organization_id?: string;
          popup_until?: string | null;
          published_at?: string | null;
          show_popup_on_app_open?: boolean;
          status?: Database["public"]["Enums"]["announcement_status"];
          target_roles?: Database["public"]["Enums"]["organization_role"][];
          target_scope?: Database["public"]["Enums"]["announcement_target_scope"];
          title?: string;
          updated_at?: string;
        };
      };
      announcement_reads: {
        Insert: {
          announcement_id: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          read_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Row: {
          announcement_id: string;
          created_at: string;
          id: string;
          organization_id: string;
          read_at: string;
          updated_at: string;
          user_id: string;
        };
        Update: {
          announcement_id?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          read_at?: string;
          updated_at?: string;
          user_id?: string;
        };
      };
      announcement_popup_dismissals: {
        Insert: {
          announcement_id: string;
          created_at?: string;
          hide_until: string;
          id?: string;
          organization_id: string;
          updated_at?: string;
          user_id: string;
        };
        Row: {
          announcement_id: string;
          created_at: string;
          hide_until: string;
          id: string;
          organization_id: string;
          updated_at: string;
          user_id: string;
        };
        Update: {
          announcement_id?: string;
          created_at?: string;
          hide_until?: string;
          id?: string;
          organization_id?: string;
          updated_at?: string;
          user_id?: string;
        };
      };
      announcement_comments: {
        Insert: {
          announcement_id: string;
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          organization_id: string;
          updated_at?: string;
          user_id: string;
        };
        Row: {
          announcement_id: string;
          content: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          organization_id: string;
          updated_at: string;
          user_id: string;
        };
        Update: {
          announcement_id?: string;
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          organization_id?: string;
          updated_at?: string;
          user_id?: string;
        };
      };
      invite_codes: {
        Insert: {
          code: string;
          created_at?: string;
          created_by_user_id?: string | null;
          default_role: Database["public"]["Enums"]["organization_role"];
          expires_at: string;
          id?: string;
          is_active?: boolean;
          max_uses: number;
          name: string;
          organization_id: string;
          updated_at?: string;
          used_count?: number;
        };
        Row: {
          code: string;
          created_at: string;
          created_by_user_id: string | null;
          default_role: Database["public"]["Enums"]["organization_role"];
          expires_at: string;
          id: string;
          is_active: boolean;
          max_uses: number;
          name: string;
          organization_id: string;
          updated_at: string;
          used_count: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by_user_id?: string | null;
          default_role?: Database["public"]["Enums"]["organization_role"];
          expires_at?: string;
          id?: string;
          is_active?: boolean;
          max_uses?: number;
          name?: string;
          organization_id?: string;
          updated_at?: string;
          used_count?: number;
        };
      };
      lost_items: {
        Insert: {
          cleaning_session_id?: string | null;
          created_at?: string;
          found_at?: string;
          id?: string;
          image_urls?: string[];
          item_name: string;
          memo?: string | null;
          organization_id: string;
          reported_by_user_id: string;
          room_label: string;
          status?: Database["public"]["Enums"]["lost_item_status"];
          updated_at?: string;
        };
        Row: {
          cleaning_session_id: string | null;
          created_at: string;
          found_at: string;
          id: string;
          image_urls: string[];
          item_name: string;
          memo: string | null;
          organization_id: string;
          reported_by_user_id: string;
          room_label: string;
          status: Database["public"]["Enums"]["lost_item_status"];
          updated_at: string;
        };
        Update: {
          cleaning_session_id?: string | null;
          created_at?: string;
          found_at?: string;
          id?: string;
          image_urls?: string[];
          item_name?: string;
          memo?: string | null;
          organization_id?: string;
          reported_by_user_id?: string;
          room_label?: string;
          status?: Database["public"]["Enums"]["lost_item_status"];
          updated_at?: string;
        };
      };
      linen_items: {
        Insert: {
          building_name?: string | null;
          category?: string | null;
          code?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Row: {
          building_name: string | null;
          category: string | null;
          code: string | null;
          created_at: string;
          created_by_user_id: string | null;
          display_order: number;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Update: {
          building_name?: string | null;
          category?: string | null;
          code?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
      };
      linen_return_record_items: {
        Insert: {
          created_at?: string;
          id?: string;
          linen_item_id: string;
          quantity: number;
          return_record_id: string;
          sort_order?: number;
        };
        Row: {
          created_at: string;
          id: string;
          linen_item_id: string;
          quantity: number;
          return_record_id: string;
          sort_order: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          linen_item_id?: string;
          quantity?: number;
          return_record_id?: string;
          sort_order?: number;
        };
      };
      linen_return_records: {
        Insert: {
          building_name: string;
          created_at?: string;
          id?: string;
          image_urls?: string[];
          note?: string | null;
          organization_id: string;
          registered_at?: string;
          registered_by_user_id: string;
          updated_at?: string;
        };
        Row: {
          building_name: string;
          created_at: string;
          id: string;
          image_urls: string[];
          note: string | null;
          organization_id: string;
          registered_at: string;
          registered_by_user_id: string;
          updated_at: string;
        };
        Update: {
          building_name?: string;
          created_at?: string;
          id?: string;
          image_urls?: string[];
          note?: string | null;
          organization_id?: string;
          registered_at?: string;
          registered_by_user_id?: string;
          updated_at?: string;
        };
      };
      maintenance_reports: {
        Insert: {
          cleaning_session_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_urls?: string[];
          issue_title: string;
          organization_id: string;
          property_name?: string | null;
          reported_by_user_id: string;
          room_label: string;
          status?: Database["public"]["Enums"]["maintenance_status"];
          updated_at?: string;
        };
        Row: {
          cleaning_session_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          image_urls: string[];
          issue_title: string;
          organization_id: string;
          property_name: string | null;
          reported_by_user_id: string;
          room_label: string;
          status: Database["public"]["Enums"]["maintenance_status"];
          updated_at: string;
        };
        Update: {
          cleaning_session_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_urls?: string[];
          issue_title?: string;
          organization_id?: string;
          property_name?: string | null;
          reported_by_user_id?: string;
          room_label?: string;
          status?: Database["public"]["Enums"]["maintenance_status"];
          updated_at?: string;
        };
      };
      notifications: {
        Insert: {
          created_at?: string;
          dedupe_key: string;
          href: string;
          id?: string;
          organization_id: string;
          payload?: Json;
          read_at?: string | null;
          recipient_user_id: string;
          source_id: string;
          source_type: string;
          type: Database["public"]["Enums"]["notification_type"];
        };
        Row: {
          created_at: string;
          dedupe_key: string;
          href: string;
          id: string;
          organization_id: string;
          payload: Json;
          read_at: string | null;
          recipient_user_id: string;
          source_id: string;
          source_type: string;
          type: Database["public"]["Enums"]["notification_type"];
        };
        Update: {
          created_at?: string;
          dedupe_key?: string;
          href?: string;
          id?: string;
          organization_id?: string;
          payload?: Json;
          read_at?: string | null;
          recipient_user_id?: string;
          source_id?: string;
          source_type?: string;
          type?: Database["public"]["Enums"]["notification_type"];
        };
      };
      order_requests: {
        Insert: {
          building_name: string;
          created_at?: string;
          delivery_date?: string | null;
          delivery_end_date?: string | null;
          delivery_start_date?: string | null;
          description?: string | null;
          id?: string;
          items?: Json;
          organization_id: string;
          reason?: string | null;
          reported_by_user_id: string;
          room_label?: string;
          status?: Database["public"]["Enums"]["order_request_status"];
          title: string;
          updated_at?: string;
          urgency?: Database["public"]["Enums"]["order_request_urgency"];
        };
        Row: {
          building_name: string;
          created_at: string;
          delivery_date: string | null;
          delivery_end_date: string | null;
          delivery_start_date: string | null;
          description: string | null;
          id: string;
          items: Json;
          organization_id: string;
          reason: string | null;
          reported_by_user_id: string;
          room_label: string;
          status: Database["public"]["Enums"]["order_request_status"];
          title: string;
          updated_at: string;
          urgency: Database["public"]["Enums"]["order_request_urgency"];
        };
        Update: {
          building_name?: string;
          created_at?: string;
          delivery_date?: string | null;
          delivery_end_date?: string | null;
          delivery_start_date?: string | null;
          description?: string | null;
          id?: string;
          items?: Json;
          organization_id?: string;
          reason?: string | null;
          reported_by_user_id?: string;
          room_label?: string;
          status?: Database["public"]["Enums"]["order_request_status"];
          title?: string;
          updated_at?: string;
          urgency?: Database["public"]["Enums"]["order_request_urgency"];
        };
      };
      cleaning_sessions: {
        Insert: {
          cleaning_date?: string;
          completed_at?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          notes?: string | null;
          organization_id: string;
          room_label: string;
          staff_user_id: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["cleaning_status"];
          task_label: string;
          updated_at?: string;
        };
        Row: {
          cleaning_date: string;
          completed_at: string | null;
          created_at: string;
          duration_seconds: number | null;
          id: string;
          notes: string | null;
          organization_id: string;
          room_label: string;
          staff_user_id: string;
          started_at: string;
          status: Database["public"]["Enums"]["cleaning_status"];
          task_label: string;
          updated_at: string;
        };
        Update: {
          cleaning_date?: string;
          completed_at?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          notes?: string | null;
          organization_id?: string;
          room_label?: string;
          staff_user_id?: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["cleaning_status"];
          task_label?: string;
          updated_at?: string;
        };
      };
      memberships: {
        Insert: {
          attendance_payroll_admin?: boolean;
          created_at?: string;
          id?: string;
          joined_at?: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["organization_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id: string;
        };
        Row: {
          attendance_payroll_admin: boolean;
          created_at: string;
          id: string;
          joined_at: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["organization_role"];
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
          user_id: string;
        };
        Update: {
          attendance_payroll_admin?: boolean;
          created_at?: string;
          id?: string;
          joined_at?: string | null;
          organization_id?: string;
          role?: Database["public"]["Enums"]["organization_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string;
        };
      };
      organizations: {
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug?: string | null;
          status?: Database["public"]["Enums"]["organization_status"];
          updated_at?: string;
        };
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string | null;
          status: Database["public"]["Enums"]["organization_status"];
          updated_at: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string | null;
          status?: Database["public"]["Enums"]["organization_status"];
          updated_at?: string;
        };
      };
      platform_admins: {
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["platform_role"];
          updated_at?: string;
          user_id: string;
        };
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          role: Database["public"]["Enums"]["platform_role"];
          updated_at: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["platform_role"];
          updated_at?: string;
          user_id?: string;
        };
      };
      profiles: {
        Insert: {
          age?: number | null;
          bottom_nav_tabs?: string[];
          can_generate_report?: boolean;
          created_at?: string;
          id: string;
          name: string;
          phone_number: string;
          preferred_language?: Database["public"]["Enums"]["app_language"];
          profile_photo_url?: string | null;
          theme_preference?: Database["public"]["Enums"]["theme_preference"];
          updated_at?: string;
        };
        Row: {
          age: number | null;
          bottom_nav_tabs: string[];
          can_generate_report: boolean;
          created_at: string;
          id: string;
          name: string;
          phone_number: string;
          preferred_language: Database["public"]["Enums"]["app_language"];
          profile_photo_url: string | null;
          theme_preference: Database["public"]["Enums"]["theme_preference"];
          updated_at: string;
        };
        Update: {
          age?: number | null;
          bottom_nav_tabs?: string[];
          can_generate_report?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          phone_number?: string;
          preferred_language?: Database["public"]["Enums"]["app_language"];
          profile_photo_url?: string | null;
          theme_preference?: Database["public"]["Enums"]["theme_preference"];
          updated_at?: string;
        };
      };
      properties: {
        Insert: {
          created_at?: string;
          display_name_en?: string | null;
          display_name_ja?: string | null;
          display_name_ko?: string | null;
          external_property_id?: string | null;
          external_provider?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          property_type?: Database["public"]["Enums"]["property_type"];
          status?: Database["public"]["Enums"]["property_status"];
          updated_at?: string;
        };
        Row: {
          created_at: string;
          display_name_en: string | null;
          display_name_ja: string | null;
          display_name_ko: string | null;
          external_property_id: string | null;
          external_provider: string | null;
          id: string;
          name: string;
          organization_id: string;
          property_type: Database["public"]["Enums"]["property_type"];
          status: Database["public"]["Enums"]["property_status"];
          updated_at: string;
        };
        Update: {
          created_at?: string;
          display_name_en?: string | null;
          display_name_ja?: string | null;
          display_name_ko?: string | null;
          external_property_id?: string | null;
          external_provider?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          property_type?: Database["public"]["Enums"]["property_type"];
          status?: Database["public"]["Enums"]["property_status"];
          updated_at?: string;
        };
      };
      reservations: {
        Insert: {
          check_in_date: string;
          check_out_date: string;
          created_at?: string;
          guest_name: string;
          id?: string;
          organization_id: string;
          property_name: string;
          raw_payload?: Json;
          room_label: string;
          source?: string;
          source_reservation_id: string;
          status?: Database["public"]["Enums"]["reservation_status"];
          updated_at?: string;
        };
        Row: {
          check_in_date: string;
          check_out_date: string;
          created_at: string;
          guest_name: string;
          id: string;
          organization_id: string;
          property_name: string;
          raw_payload: Json;
          room_label: string;
          source: string;
          source_reservation_id: string;
          status: Database["public"]["Enums"]["reservation_status"];
          updated_at: string;
        };
        Update: {
          check_in_date?: string;
          check_out_date?: string;
          created_at?: string;
          guest_name?: string;
          id?: string;
          organization_id?: string;
          property_name?: string;
          raw_payload?: Json;
          room_label?: string;
          source?: string;
          source_reservation_id?: string;
          status?: Database["public"]["Enums"]["reservation_status"];
          updated_at?: string;
        };
      };
      rooms: {
        Insert: {
          created_at?: string;
          external_minimum_stay?: number | null;
          external_provider?: string | null;
          external_room_id?: string | null;
          floor?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          property_id: string;
          room_label: string;
          status?: Database["public"]["Enums"]["room_status"];
          unit_type?: string | null;
          updated_at?: string;
        };
        Row: {
          created_at: string;
          external_minimum_stay: number | null;
          external_provider: string | null;
          external_room_id: string | null;
          floor: string | null;
          id: string;
          name: string;
          organization_id: string;
          property_id: string;
          room_label: string;
          status: Database["public"]["Enums"]["room_status"];
          unit_type: string | null;
          updated_at: string;
        };
        Update: {
          created_at?: string;
          external_minimum_stay?: number | null;
          external_provider?: string | null;
          external_room_id?: string | null;
          floor?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          property_id?: string;
          room_label?: string;
          status?: Database["public"]["Enums"]["room_status"];
          unit_type?: string | null;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      join_organization_with_invite_code: {
        Args: { p_user_id: string; p_code: string };
        Returns: Array<{
          organization_id: string;
          role: Database["public"]["Enums"]["organization_role"];
          status: string;
        }>;
      };
    };
    Enums: {
      announcement_status: "archived" | "draft" | "published";
      lost_item_status: "disposal_scheduled" | "disposed" | "registered" | "stored";
      maintenance_status: "closed" | "in_progress" | "open" | "resolved";
      order_request_status: "approved" | "closed" | "ordered" | "received" | "requested";
      order_request_urgency: "high" | "normal";
      announcement_target_scope: "everyone" | "roles";
      app_language: "en" | "ja" | "ko";
      cleaning_status: "cancelled" | "completed" | "in_progress";
      membership_status: "active" | "invited" | "removed" | "suspended";
      notification_type:
        | "order_processed"
        | "task_shared"
        | "task_updated"
        | "task_completed"
        | "task_due_soon"
        | "task_overdue"
        | "project_shared"
        | "suggestion_activity"
        | "attendance_activity";
      organization_role:
        | "cs_staff"
        | "field_manager"
        | "office_admin"
        | "owner"
        | "part_time_staff"
        | "staff";
      organization_status: "active" | "archived" | "suspended";
      platform_role: "developer_super_admin";
      property_status: "active" | "archived" | "inactive" | "under_construction";
      property_type: "apartment" | "hotel" | "house" | "multi_room_building" | "standalone";
      reservation_status:
        | "cancelled"
        | "checked_in"
        | "checked_out"
        | "confirmed"
        | "no_show";
      room_status: "active" | "inactive" | "under_construction";
      theme_preference: "dark" | "light" | "system";
    };
  };
};
