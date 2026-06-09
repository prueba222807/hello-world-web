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
      app_settings: {
        Row: {
          default_document_id: number | null
          default_invoice_note: string | null
          id: string
          max_discount_pct: number
          singleton: boolean
          updated_at: string
        }
        Insert: {
          default_document_id?: number | null
          default_invoice_note?: string | null
          id?: string
          max_discount_pct?: number
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          default_document_id?: number | null
          default_invoice_note?: string | null
          id?: string
          max_discount_pct?: number
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      customer_events: {
        Row: {
          accuracy: number | null
          created_at: string
          created_by: string
          customer_id: string
          event_type: string
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          photo_url: string | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          created_by: string
          customer_id: string
          event_type: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          photo_url?: string | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          created_by?: string
          customer_id?: string
          event_type?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          photo_url?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          active: boolean
          address: string | null
          branch_office: number | null
          city_code: string | null
          city_name: string | null
          commercial_name: string | null
          country_code: string | null
          created_at: string
          created_by_user: string | null
          display_name: string
          email: string | null
          first_name: string | null
          geo_captured_at: string | null
          geo_lat: number | null
          geo_lng: number | null
          id: string
          id_type: string | null
          identification: string
          last_name: string | null
          person_type: string | null
          phone: string | null
          raw: Json | null
          seller_siigo_id: string | null
          siigo_id: string | null
          state_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          branch_office?: number | null
          city_code?: string | null
          city_name?: string | null
          commercial_name?: string | null
          country_code?: string | null
          created_at?: string
          created_by_user?: string | null
          display_name: string
          email?: string | null
          first_name?: string | null
          geo_captured_at?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          id_type?: string | null
          identification: string
          last_name?: string | null
          person_type?: string | null
          phone?: string | null
          raw?: Json | null
          seller_siigo_id?: string | null
          siigo_id?: string | null
          state_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          branch_office?: number | null
          city_code?: string | null
          city_name?: string | null
          commercial_name?: string | null
          country_code?: string | null
          created_at?: string
          created_by_user?: string | null
          display_name?: string
          email?: string | null
          first_name?: string | null
          geo_captured_at?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          id_type?: string | null
          identification?: string
          last_name?: string | null
          person_type?: string | null
          phone?: string | null
          raw?: Json | null
          seller_siigo_id?: string | null
          siigo_id?: string | null
          state_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          icon: string | null
          id: string
          label: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          icon?: string | null
          id?: string
          label: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          icon?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      flow_settings: {
        Row: {
          client_delivery_requires_geo: boolean
          client_delivery_requires_photo: boolean
          confirmation_mode: string
          id: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          client_delivery_requires_geo?: boolean
          client_delivery_requires_photo?: boolean
          confirmation_mode?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          client_delivery_requires_geo?: boolean
          client_delivery_requires_photo?: boolean
          confirmation_mode?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          order_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          accuracy: number | null
          actor_id: string
          actor_role: Database["public"]["Enums"]["app_role"]
          event_at: string
          event_type: Database["public"]["Enums"]["order_event_type"]
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          lat: number | null
          lng: number | null
          observations: string | null
          order_id: string
          receiver_id: string | null
          receiver_role: Database["public"]["Enums"]["app_role"] | null
          signature_url: string | null
          to_status: Database["public"]["Enums"]["order_status"]
          visible_date: string | null
        }
        Insert: {
          accuracy?: number | null
          actor_id: string
          actor_role: Database["public"]["Enums"]["app_role"]
          event_at?: string
          event_type: Database["public"]["Enums"]["order_event_type"]
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          lat?: number | null
          lng?: number | null
          observations?: string | null
          order_id: string
          receiver_id?: string | null
          receiver_role?: Database["public"]["Enums"]["app_role"] | null
          signature_url?: string | null
          to_status: Database["public"]["Enums"]["order_status"]
          visible_date?: string | null
        }
        Update: {
          accuracy?: number | null
          actor_id?: string
          actor_role?: Database["public"]["Enums"]["app_role"]
          event_at?: string
          event_type?: Database["public"]["Enums"]["order_event_type"]
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          lat?: number | null
          lng?: number | null
          observations?: string | null
          order_id?: string
          receiver_id?: string | null
          receiver_role?: Database["public"]["Enums"]["app_role"] | null
          signature_url?: string | null
          to_status?: Database["public"]["Enums"]["order_status"]
          visible_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_evidences: {
        Row: {
          accuracy: number | null
          created_at: string
          event_id: string
          file_name: string
          file_type: string
          file_url: string
          id: string
          lat: number | null
          lng: number | null
          location_captured_at: string | null
          order_id: string
          uploaded_by: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          event_id: string
          file_name: string
          file_type: string
          file_url: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_captured_at?: string | null
          order_id: string
          uploaded_by: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          event_id?: string
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_captured_at?: string | null
          order_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_evidences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "order_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_evidences_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_handoffs: {
        Row: {
          accuracy: number | null
          action: string
          created_at: string
          from_role: Database["public"]["Enums"]["app_role"] | null
          from_user: string | null
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          order_id: string
          photo_url: string | null
          reject_reason: string | null
          responded_at: string | null
          signature_url: string | null
          status: string
          to_role: Database["public"]["Enums"]["app_role"]
          to_user: string | null
        }
        Insert: {
          accuracy?: number | null
          action: string
          created_at?: string
          from_role?: Database["public"]["Enums"]["app_role"] | null
          from_user?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          order_id: string
          photo_url?: string | null
          reject_reason?: string | null
          responded_at?: string | null
          signature_url?: string | null
          status?: string
          to_role: Database["public"]["Enums"]["app_role"]
          to_user?: string | null
        }
        Update: {
          accuracy?: number | null
          action?: string
          created_at?: string
          from_role?: Database["public"]["Enums"]["app_role"] | null
          from_user?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          order_id?: string
          photo_url?: string | null
          reject_reason?: string | null
          responded_at?: string | null
          signature_url?: string | null
          status?: string
          to_role?: Database["public"]["Enums"]["app_role"]
          to_user?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          is_gift: boolean
          line_subtotal: number
          line_tax: number
          line_total: number
          manual_total: number | null
          order_id: string
          product_id: string
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          is_gift?: boolean
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          manual_total?: number | null
          order_id: string
          product_id: string
          quantity: number
          tax_rate?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          is_gift?: boolean
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          manual_total?: number | null
          order_id?: string
          product_id?: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
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
        ]
      }
      order_requests: {
        Row: {
          created_at: string
          id: string
          order_id: string
          reason: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          reason?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          reason?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          confirmed_at: string | null
          created_at: string
          created_geo_accuracy: number | null
          created_lat: number | null
          created_lng: number | null
          credit_days: number | null
          current_holder_role: Database["public"]["Enums"]["app_role"] | null
          current_holder_user: string | null
          customer_id: string
          delivery_date: string | null
          dispatched_at: string | null
          due_date: string | null
          finalized_at: string | null
          has_manual_price: boolean
          id: string
          invoice_pdf_url: string | null
          invoiced_at: string | null
          manual_price_acknowledged: boolean
          notes: string | null
          order_consecutive: number | null
          order_number: string | null
          order_prefix: string | null
          payment_method_id: string | null
          pending_holder_role: Database["public"]["Enums"]["app_role"] | null
          pending_holder_user: string | null
          pending_status: Database["public"]["Enums"]["order_status"] | null
          seller_id: string
          siigo_credit_note_id: string | null
          siigo_credit_note_number: string | null
          siigo_invoice_consecutive: number | null
          siigo_invoice_id: string | null
          siigo_invoice_number: string | null
          siigo_invoice_prefix: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          created_geo_accuracy?: number | null
          created_lat?: number | null
          created_lng?: number | null
          credit_days?: number | null
          current_holder_role?: Database["public"]["Enums"]["app_role"] | null
          current_holder_user?: string | null
          customer_id: string
          delivery_date?: string | null
          dispatched_at?: string | null
          due_date?: string | null
          finalized_at?: string | null
          has_manual_price?: boolean
          id?: string
          invoice_pdf_url?: string | null
          invoiced_at?: string | null
          manual_price_acknowledged?: boolean
          notes?: string | null
          order_consecutive?: number | null
          order_number?: string | null
          order_prefix?: string | null
          payment_method_id?: string | null
          pending_holder_role?: Database["public"]["Enums"]["app_role"] | null
          pending_holder_user?: string | null
          pending_status?: Database["public"]["Enums"]["order_status"] | null
          seller_id: string
          siigo_credit_note_id?: string | null
          siigo_credit_note_number?: string | null
          siigo_invoice_consecutive?: number | null
          siigo_invoice_id?: string | null
          siigo_invoice_number?: string | null
          siigo_invoice_prefix?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          created_geo_accuracy?: number | null
          created_lat?: number | null
          created_lng?: number | null
          credit_days?: number | null
          current_holder_role?: Database["public"]["Enums"]["app_role"] | null
          current_holder_user?: string | null
          customer_id?: string
          delivery_date?: string | null
          dispatched_at?: string | null
          due_date?: string | null
          finalized_at?: string | null
          has_manual_price?: boolean
          id?: string
          invoice_pdf_url?: string | null
          invoiced_at?: string | null
          manual_price_acknowledged?: boolean
          notes?: string | null
          order_consecutive?: number | null
          order_number?: string | null
          order_prefix?: string | null
          payment_method_id?: string | null
          pending_holder_role?: Database["public"]["Enums"]["app_role"] | null
          pending_holder_user?: string | null
          pending_status?: Database["public"]["Enums"]["order_status"] | null
          seller_id?: string
          siigo_credit_note_id?: string | null
          siigo_credit_note_number?: string | null
          siigo_invoice_consecutive?: number | null
          siigo_invoice_id?: string | null
          siigo_invoice_number?: string | null
          siigo_invoice_prefix?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
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
            foreignKeyName: "orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          credit_days_options: Json
          display_name: string | null
          id: string
          is_credit: boolean
          name: string
          raw: Json | null
          siigo_id: number
          type: string | null
          updated_at: string
          visible_to_sellers: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          credit_days_options?: Json
          display_name?: string | null
          id?: string
          is_credit?: boolean
          name: string
          raw?: Json | null
          siigo_id: number
          type?: string | null
          updated_at?: string
          visible_to_sellers?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          credit_days_options?: Json
          display_name?: string | null
          id?: string
          is_credit?: boolean
          name?: string
          raw?: Json | null
          siigo_id?: number
          type?: string | null
          updated_at?: string
          visible_to_sellers?: boolean
        }
        Relationships: []
      }
      products: {
        Row: {
          account_group: number | null
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          raw: Json | null
          siigo_id: string | null
          stock: number | null
          stock_override: number | null
          tax_id: number | null
          tax_rate: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          account_group?: number | null
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number
          raw?: Json | null
          siigo_id?: string | null
          stock?: number | null
          stock_override?: number | null
          tax_id?: number | null
          tax_rate?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          account_group?: number | null
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          raw?: Json | null
          siigo_id?: string | null
          stock?: number | null
          stock_override?: number | null
          tax_id?: number | null
          tax_rate?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      seller_sequences: {
        Row: {
          created_at: string
          next_consecutive: number
          prefix: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          next_consecutive?: number
          prefix?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          next_consecutive?: number
          prefix?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sellers: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          identification: string | null
          last_name: string | null
          raw: Json | null
          siigo_user_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          identification?: string | null
          last_name?: string | null
          raw?: Json | null
          siigo_user_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          identification?: string | null
          last_name?: string | null
          raw?: Json | null
          siigo_user_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      siigo_config: {
        Row: {
          access_key_encrypted: string
          created_at: string
          id: string
          is_active: boolean
          last_test_at: string | null
          last_test_message: string | null
          last_test_ok: boolean | null
          partner_id: string
          updated_at: string
          username: string
        }
        Insert: {
          access_key_encrypted: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          partner_id?: string
          updated_at?: string
          username: string
        }
        Update: {
          access_key_encrypted?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          partner_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      siigo_document_types: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          raw: Json | null
          siigo_id: number
          type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          raw?: Json | null
          siigo_id: number
          type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          raw?: Json | null
          siigo_id?: number
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      siigo_tokens: {
        Row: {
          access_token: string
          config_id: string
          created_at: string
          expires_at: string
          id: string
        }
        Insert: {
          access_token: string
          config_id: string
          created_at?: string
          expires_at: string
          id?: string
        }
        Update: {
          access_token?: string
          config_id?: string
          created_at?: string
          expires_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "siigo_tokens_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "siigo_config"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          entity: string
          errors: number | null
          finished_at: string | null
          id: string
          inserted: number | null
          message: string | null
          started_at: string
          status: string
          total: number | null
          updated: number | null
        }
        Insert: {
          entity: string
          errors?: number | null
          finished_at?: string | null
          id?: string
          inserted?: number | null
          message?: string | null
          started_at?: string
          status: string
          total?: number | null
          updated?: number | null
        }
        Update: {
          entity?: string
          errors?: number | null
          finished_at?: string | null
          id?: string
          inserted?: number | null
          message?: string | null
          started_at?: string
          status?: string
          total?: number | null
          updated?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_order_number: {
        Args: { _seller_id: string }
        Returns: {
          consecutive: number
          order_number: string
          prefix: string
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "vendedor"
        | "facturacion"
        | "cartera"
        | "bodega"
        | "conductor"
      order_event_type:
        | "confirmation"
        | "bill_to_warehouse"
        | "warehouse_receives"
        | "warehouse_to_driver"
        | "driver_receives"
        | "driver_delivers_customer"
        | "warehouse_delivers_customer"
        | "driver_returns_billing"
        | "billing_receives_return"
        | "billing_to_collections"
        | "collections_receives"
        | "transfer_pending"
        | "transfer_accepted"
        | "transfer_rejected"
        | "admin_edit"
      order_status:
        | "draft"
        | "confirmed"
        | "sent_to_siigo"
        | "invoiced"
        | "cancelled"
        | "pending"
        | "dispatched"
        | "ready_for_warehouse"
        | "in_warehouse"
        | "ready_for_driver"
        | "in_transit"
        | "delivered"
        | "returning_to_billing"
        | "with_collections"
        | "closed"
        | "voided"
        | "awaiting_billing"
        | "awaiting_warehouse"
        | "awaiting_driver"
        | "awaiting_billing_return"
        | "returned_to_billing"
        | "awaiting_collections"
        | "finalized"
        | "rejected"
        | "pending_acceptance"
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
      app_role: [
        "admin",
        "vendedor",
        "facturacion",
        "cartera",
        "bodega",
        "conductor",
      ],
      order_event_type: [
        "confirmation",
        "bill_to_warehouse",
        "warehouse_receives",
        "warehouse_to_driver",
        "driver_receives",
        "driver_delivers_customer",
        "warehouse_delivers_customer",
        "driver_returns_billing",
        "billing_receives_return",
        "billing_to_collections",
        "collections_receives",
        "transfer_pending",
        "transfer_accepted",
        "transfer_rejected",
        "admin_edit",
      ],
      order_status: [
        "draft",
        "confirmed",
        "sent_to_siigo",
        "invoiced",
        "cancelled",
        "pending",
        "dispatched",
        "ready_for_warehouse",
        "in_warehouse",
        "ready_for_driver",
        "in_transit",
        "delivered",
        "returning_to_billing",
        "with_collections",
        "closed",
        "voided",
        "awaiting_billing",
        "awaiting_warehouse",
        "awaiting_driver",
        "awaiting_billing_return",
        "returned_to_billing",
        "awaiting_collections",
        "finalized",
        "rejected",
        "pending_acceptance",
      ],
    },
  },
} as const
