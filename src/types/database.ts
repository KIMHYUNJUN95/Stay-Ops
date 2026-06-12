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
          property_id?: string | null;
          recurrence_rule?: string | null;
          reservation_id?: string | null;
          room_id?: string | null;
          scheduled_date?: string | null;
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
          property_id: string | null;
          recurrence_rule: string | null;
          reservation_id: string | null;
          room_id: string | null;
          scheduled_date: string | null;
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
          property_id?: string | null;
          recurrence_rule?: string | null;
          reservation_id?: string | null;
          room_id?: string | null;
          scheduled_date?: string | null;
          sort_order?: number | null;
          status?: string;
          tags?: string[];
          time_label?: string | null;
          title?: string;
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
        | "task_overdue";
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
