export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  app: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_unit_id: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      has_capability: {
        Args: {
          p_cap: Database["public"]["Enums"]["capability"]
          p_unit?: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_room_available: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_exclude_booking_id?: string
          p_room_id: string
        }
        Returns: boolean
      }
      is_unit_admin_of: { Args: { p_unit: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attendance_absences: {
        Row: {
          created_at: string
          created_by: string | null
          day_id: string
          dependant_id: string | null
          id: string
          profile_id: string | null
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_id: string
          dependant_id?: string | null
          id?: string
          profile_id?: string | null
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_id?: string
          dependant_id?: string | null
          id?: string
          profile_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_absences_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_absences_dependant_id_fkey"
            columns: ["dependant_id"]
            isOneToOne: false
            referencedRelation: "dependants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_absences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_days: {
        Row: {
          attendance_date: string
          created_at: string
          created_by: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          status: Database["public"]["Enums"]["attendance_status"]
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attendance_date: string
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attendance_date?: string
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_days_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          active_unit_id: string | null
          changed_at: string
          changed_by: string | null
          diff: Json | null
          id: number
          new_data: Json | null
          old_data: Json | null
          op: string
          row_pk: string
          table_name: string
        }
        Insert: {
          active_unit_id?: string | null
          changed_at?: string
          changed_by?: string | null
          diff?: Json | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          op: string
          row_pk: string
          table_name: string
        }
        Update: {
          active_unit_id?: string | null
          changed_at?: string
          changed_by?: string | null
          diff?: Json | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          op?: string
          row_pk?: string
          table_name?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          actual_check_in: string | null
          actual_check_out: string | null
          check_in_date: string
          check_out_date: string
          created_at: string
          created_by: string | null
          guest_name: string
          guest_rank: string | null
          id: string
          room_id: string
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          check_in_date: string
          check_out_date: string
          created_at?: string
          created_by?: string | null
          guest_name: string
          guest_rank?: string | null
          id?: string
          room_id: string
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          check_in_date?: string
          check_out_date?: string
          created_at?: string
          created_by?: string | null
          guest_name?: string
          guest_rank?: string | null
          id?: string
          room_id?: string
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "v_rooms_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_templates: {
        Row: {
          capabilities: Database["public"]["Enums"]["capability"][]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capabilities: Database["public"]["Enums"]["capability"][]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capabilities?: Database["public"]["Enums"]["capability"][]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      dependants: {
        Row: {
          auth_user_id: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          dining_in: boolean
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          notes: string | null
          primary_profile_id: string
          relation: Database["public"]["Enums"]["relation_type"]
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          dining_in?: boolean
          full_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          primary_profile_id: string
          relation: Database["public"]["Enums"]["relation_type"]
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          dining_in?: boolean
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          primary_profile_id?: string
          relation?: Database["public"]["Enums"]["relation_type"]
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dependants_primary_profile_id_fkey"
            columns: ["primary_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependants_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          request_hash: string
          response_body: Json
          response_status: number
          user_id: string
        }
        Insert: {
          created_at?: string
          key: string
          request_hash: string
          response_body: Json
          response_status: number
          user_id: string
        }
        Update: {
          created_at?: string
          key?: string
          request_hash?: string
          response_body?: Json
          response_status?: number
          user_id?: string
        }
        Relationships: []
      }
      item_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
          rate: number
          ration_scale: number | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          rate: number
          ration_scale?: number | null
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          rate?: number
          ration_scale?: number | null
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_items_current"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          category: Database["public"]["Enums"]["item_category"]
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sku: string | null
          unit_id: string | null
          uom: Database["public"]["Enums"]["uom"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["item_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sku?: string | null
          unit_id?: string | null
          uom: Database["public"]["Enums"]["uom"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sku?: string | null
          unit_id?: string | null
          uom?: Database["public"]["Enums"]["uom"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_sizes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          label: string
          sort_order: number
          unit_count: number | null
          updated_at: string
          updated_by: string | null
          volume_ml: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          label: string
          sort_order?: number
          unit_count?: number | null
          updated_at?: string
          updated_by?: string | null
          volume_ml?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          label?: string
          sort_order?: number
          unit_count?: number | null
          updated_at?: string
          updated_by?: string | null
          volume_ml?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          dining_in: boolean
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          rank: string | null
          role: Database["public"]["Enums"]["user_role"]
          service_no: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dining_in?: boolean
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          rank?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          service_no?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dining_in?: boolean
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          rank?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          service_no?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      ration_scale_item_versions: {
        Row: {
          auth_qty: number
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
          scale_id: string
          uom: Database["public"]["Enums"]["uom"]
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          auth_qty: number
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          scale_id: string
          uom: Database["public"]["Enums"]["uom"]
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          auth_qty?: number
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          scale_id?: string
          uom?: Database["public"]["Enums"]["uom"]
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ration_scale_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ration_scale_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_items_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ration_scale_item_versions_scale_id_fkey"
            columns: ["scale_id"]
            isOneToOne: false
            referencedRelation: "ration_scales"
            referencedColumns: ["id"]
          },
        ]
      }
      ration_scales: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          rank_class: Database["public"]["Enums"]["ration_class"]
          terrain: Database["public"]["Enums"]["ration_terrain"]
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rank_class: Database["public"]["Enums"]["ration_class"]
          terrain: Database["public"]["Enums"]["ration_terrain"]
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rank_class?: Database["public"]["Enums"]["ration_class"]
          terrain?: Database["public"]["Enums"]["ration_terrain"]
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ration_scales_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      room_bill_items: {
        Row: {
          amount: number
          bill_id: string
          category: string
          created_at: string
          description: string
          id: string
          item_id: string | null
          meal_type: string | null
          order_id: string | null
          quantity: number
        }
        Insert: {
          amount: number
          bill_id: string
          category: string
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          meal_type?: string | null
          order_id?: string | null
          quantity?: number
        }
        Update: {
          amount?: number
          bill_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          meal_type?: string | null
          order_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "room_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bill_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bill_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_items_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bill_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "room_bill_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      room_bill_orders: {
        Row: {
          bill_id: string
          created_at: string
          id: string
          label: string
          note: string | null
          occurred_at: string
          updated_at: string
        }
        Insert: {
          bill_id: string
          created_at?: string
          id?: string
          label: string
          note?: string | null
          occurred_at?: string
          updated_at?: string
        }
        Update: {
          bill_id?: string
          created_at?: string
          id?: string
          label?: string
          note?: string | null
          occurred_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_bill_orders_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "room_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      room_bills: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          status: string
          total_amount: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          status?: string
          total_amount?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          status?: string
          total_amount?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_bills_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bills_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      room_furniture: {
        Row: {
          condition: string
          created_at: string
          furniture_id: string
          id: string
          notes: string | null
          quantity: number
          room_id: string
          updated_at: string
        }
        Insert: {
          condition?: string
          created_at?: string
          furniture_id: string
          id?: string
          notes?: string | null
          quantity?: number
          room_id: string
          updated_at?: string
        }
        Update: {
          condition?: string
          created_at?: string
          furniture_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_furniture_furniture_id_fkey"
            columns: ["furniture_id"]
            isOneToOne: false
            referencedRelation: "unit_furniture"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_furniture_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_furniture_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "v_rooms_current"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          name: string
          room_type: string
          nightly_rate: number
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          room_type?: string
          nightly_rate?: number
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          room_type?: string
          nightly_rate?: number
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_furniture: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_furniture_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_inventory: {
        Row: {
          acquired_on: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          item_id: string
          pack_size_id: string
          qty_packs: number
          rate: number
          source: string | null
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acquired_on?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          item_id: string
          pack_size_id: string
          qty_packs?: number
          rate: number
          source?: string | null
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acquired_on?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          item_id?: string
          pack_size_id?: string
          qty_packs?: number
          rate?: number
          source?: string | null
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_items_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_inventory_pack_size_id_fkey"
            columns: ["pack_size_id"]
            isOneToOne: false
            referencedRelation: "pack_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_inventory_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          mess_type: Database["public"]["Enums"]["mess_type"] | null
          name: string
          terrain: Database["public"]["Enums"]["ration_terrain"] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          mess_type?: Database["public"]["Enums"]["mess_type"] | null
          name: string
          terrain?: Database["public"]["Enums"]["ration_terrain"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          mess_type?: Database["public"]["Enums"]["mess_type"] | null
          name?: string
          terrain?: Database["public"]["Enums"]["ration_terrain"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_capabilities: {
        Row: {
          capability: Database["public"]["Enums"]["capability"]
          granted_at: string
          granted_by: string | null
          unit_id: string
          user_id: string
        }
        Insert: {
          capability: Database["public"]["Enums"]["capability"]
          granted_at?: string
          granted_by?: string | null
          unit_id: string
          user_id: string
        }
        Update: {
          capability?: Database["public"]["Enums"]["capability"]
          granted_at?: string
          granted_by?: string | null
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capabilities_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_capabilities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_items_current: {
        Row: {
          category: Database["public"]["Enums"]["item_category"] | null
          created_at: string | null
          created_by: string | null
          current_rate: number | null
          current_ration_scale: number | null
          id: string | null
          is_active: boolean | null
          name: string | null
          rate_valid_from: string | null
          sku: string | null
          unit_id: string | null
          uom: Database["public"]["Enums"]["uom"] | null
          updated_at: string | null
          updated_by: string | null
          version_id: string | null
          version_notes: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ration_scale_items_current: {
        Row: {
          auth_qty: number | null
          category: Database["public"]["Enums"]["item_category"] | null
          created_by: string | null
          item_id: string | null
          item_name: string | null
          notes: string | null
          rank_class: Database["public"]["Enums"]["ration_class"] | null
          scale_active: boolean | null
          scale_id: string | null
          scale_name: string | null
          sku: string | null
          terrain: Database["public"]["Enums"]["ration_terrain"] | null
          unit_id: string | null
          uom: Database["public"]["Enums"]["uom"] | null
          valid_from: string | null
          version_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ration_scale_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ration_scale_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_items_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ration_scale_item_versions_scale_id_fkey"
            columns: ["scale_id"]
            isOneToOne: false
            referencedRelation: "ration_scales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ration_scales_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      v_rooms_current: {
        Row: {
          created_at: string | null
          current_booking_id: string | null
          current_status: string | null
          id: string | null
          name: string | null
          room_type: string | null
          nightly_rate: number | null
          status: string | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_booking_id?: never
          current_status?: never
          id?: string | null
          name?: string | null
          room_type?: string | null
          nightly_rate?: number | null
          status?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_booking_id?: never
          current_status?: never
          id?: string | null
          name?: string | null
          room_type?: string | null
          nightly_rate?: number | null
          status?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      v_unit_inventory_current: {
        Row: {
          acquired_on: string | null
          category: Database["public"]["Enums"]["item_category"] | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_active: boolean | null
          item_id: string | null
          item_name: string | null
          kind: string | null
          pack_label: string | null
          pack_size_id: string | null
          qty_packs: number | null
          rate: number | null
          source: string | null
          unit_count: number | null
          unit_id: string | null
          uom: Database["public"]["Enums"]["uom"] | null
          updated_at: string | null
          updated_by: string | null
          volume_ml: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_items_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_inventory_pack_size_id_fkey"
            columns: ["pack_size_id"]
            isOneToOne: false
            referencedRelation: "pack_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_inventory_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      set_item_rate: {
        Args: {
          p_effective_at?: string
          p_item_id: string
          p_notes?: string
          p_rate: number
          p_ration_scale?: number
        }
        Returns: string
      }
      set_ration_scale_item: {
        Args: {
          p_auth_qty: number
          p_effective_at?: string
          p_item_id: string
          p_notes?: string
          p_scale_id: string
          p_uom: Database["public"]["Enums"]["uom"]
        }
        Returns: string
      }
    }
    Enums: {
      attendance_status: "draft" | "finalized"
      capability:
        | "masters.read"
        | "masters.write"
        | "masters.write.global"
        | "attendance.read"
        | "attendance.write"
        | "attendance.finalize"
        | "ration.read"
        | "ration.issue"
        | "ration.adjust"
        | "bar.read"
        | "bar.write"
        | "bar.finalize"
        | "rooms.read"
        | "rooms.booking.write"
        | "rooms.manage"
        | "parties.read"
        | "parties.write"
        | "parties.finalize"
        | "users.read"
        | "users.invite"
        | "users.manage"
        | "reports.unit"
        | "reports.cross_unit"
        | "billing.read"
        | "billing.draft"
        | "billing.finalize"
        | "inventory.read"
        | "inventory.write"
      item_category:
        | "ration"
        | "soft_drink"
        | "alcohol"
        | "cigar"
        | "grocery"
        | "room"
      mess_type: "officer" | "jco" | "or" | "combined"
      ration_class: "officer" | "jco" | "or" | "civilian"
      ration_terrain: "plains" | "desert" | "high_altitude" | "field" | "sea"
      relation_type: "spouse" | "child" | "parent"
      uom: "kg" | "g" | "l" | "ml" | "piece" | "pack" | "bottle"
      user_role: "user" | "manager" | "unit_admin" | "admin"
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
  app: {
    Enums: {},
  },
  public: {
    Enums: {
      attendance_status: ["draft", "finalized"],
      capability: [
        "masters.read",
        "masters.write",
        "masters.write.global",
        "attendance.read",
        "attendance.write",
        "attendance.finalize",
        "ration.read",
        "ration.issue",
        "ration.adjust",
        "bar.read",
        "bar.write",
        "bar.finalize",
        "rooms.read",
        "rooms.booking.write",
        "rooms.manage",
        "parties.read",
        "parties.write",
        "parties.finalize",
        "users.read",
        "users.invite",
        "users.manage",
        "reports.unit",
        "reports.cross_unit",
        "billing.read",
        "billing.draft",
        "billing.finalize",
        "inventory.read",
        "inventory.write",
      ],
      item_category: [
        "ration",
        "soft_drink",
        "alcohol",
        "cigar",
        "grocery",
        "room",
      ],
      mess_type: ["officer", "jco", "or", "combined"],
      ration_class: ["officer", "jco", "or", "civilian"],
      ration_terrain: ["plains", "desert", "high_altitude", "field", "sea"],
      relation_type: ["spouse", "child", "parent"],
      uom: ["kg", "g", "l", "ml", "piece", "pack", "bottle"],
      user_role: ["user", "manager", "unit_admin", "admin"],
    },
  },
} as const

