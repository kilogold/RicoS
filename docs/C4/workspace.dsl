workspace "Name" "Description" {

    !identifiers hierarchical

    model {
        c = person "Customer"
        k = person "Kitchen Staff"
        s = person "Storefront Staff"

        kitchen = softwareSystem "Kitchen Relay" {
            relay = container "Relay" "Receives orders from the web API and prints tickets to the kitchen." "Typescript and Node.js" {
                ticket_printing = component "Ticket Printing" "Formats tickets and sends them to console or CUPS lp." "Typescript and Node.js"
            }
        }

        commerce = softwareSystem "Online Ordering" {
            admin = container "Admin Panel" "Provides admin functionality to the storefront staff." "Typescript and Next.js" "Web Browser"
            web_client = container "Web Client" "Browser runtime for customer ordering flows." "Typescript and Next.js" "Web Browser" {
                stripe_checkout = component "Stripe Checkout" "Handles the checkout process with Stripe." "Typescript and Next.js"
                solana_pay_checkout = component "Solana Pay Checkout" "Handles the checkout process with Solana Pay." "Typescript and Next.js"
            }
            web_server = container "Web Server" "Serves customer/staff web content and executes server-rendered flows." "Typescript and Next.js" "Web Server"
            api = container "Web API" "Operates RicoS payment confirmation, kitchen dispatch, and staff-driven order lifecycle transitions." "Typescript and Next.js" "Web API" {
                stripe_payment = component "Stripe Payment" "Accepts Stripe webhook confirmations, validates payloads, and records deduplicated paid-order facts." "Typescript and Node.js"
                solana_payment = component "Solana Payment" "Issues checkout reference addresses, tracks pending references, polls on-chain settlement, and records pending/confirmed/expired outcomes." "Typescript and Node.js"
                kitchen_order_dispatch = component "Kitchen Order Dispatch" "Dispatches only trusted paid-order facts to the kitchen relay and owns print acknowledgment tracking." "Typescript and Node.js"
                staff_order_management = component "Staff Order Management" "Applies back-office lifecycle actions (finalize/refund) and cannot create or verify payment facts." "Typescript and Node.js"
            }
            db = container "Database" "Stores payment state, kitchen dispatch queue state, and staff order lifecycle state." "SQL" "Database"
        }
        
        stripe = softwareSystem "Stripe" "Stripe's payment processing system" "External System"
        helius = softwareSystem "Helius" "Solana network services" "External System"
    
    
        stripe -> commerce.api.stripe_payment "Send payment confirmation event"
        
        kitchen.relay -> commerce.api "Acknowledge order ticket printed"
        
        commerce.admin -> commerce.api.staff_order_management "Finalize or refund order from staff console"
        
        commerce.web_client.solana_pay_checkout -> commerce.api.solana_payment "Request new Solana payment reference"
        commerce.web_client.stripe_checkout -> stripe "Charge customer card"
        commerce.web_client.solana_pay_checkout -> helius "Submit Solana Pay transaction"
        
        commerce.api.solana_payment -> helius "Verify payment reference settlement status"
        commerce.api.solana_payment -> commerce.api.kitchen_order_dispatch "Publish paid order for relay subscribers"
        commerce.api.solana_payment -> commerce.db "Manage Solana payment order state"
        
        commerce.api.stripe_payment -> commerce.api.kitchen_order_dispatch "Publish paid order for relay subscribers"
        commerce.api.stripe_payment -> commerce.db "Manage Stripe payment order state"
        
        commerce.api -> kitchen.relay "Notify newly paid order"
        commerce.api.kitchen_order_dispatch -> commerce.db "Manage kitchen dispatch queue state"
        
        commerce.api.staff_order_management -> commerce.db "Save finalized or refunded order state"

        // Person relationships
        c -> commerce.web_client "Orders from the web client"
        s -> commerce.admin "Finalize/Refund orders"
        commerce.web_client -> commerce.web_server "Load customer web content and server-rendered responses"
        commerce.admin -> commerce.web_server "Load staff web content and server-rendered responses"

        // Higher-level relationship abstractions
        # commerce.api -> commerce.db "Track order lifecycle and menu versions"

        deploymentEnvironment "Production" {
            deploymentNode "Customer Client Device" "Any customer-managed mobile or desktop device running a web browser." "Web Browser" {
                containerInstance commerce.web_client
            }

            deploymentNode "Storefront Device" "Store-managed device running the staff browser session." "Web Browser" {
                containerInstance commerce.admin
            }

            deploymentNode "Vercel" "Managed runtime for server-side application workloads." {
                deploymentNode "Web Runtime" {
                    containerInstance commerce.web_server
                }
                deploymentNode "API Runtime" {
                    containerInstance commerce.api
                }
            }

            deploymentNode "Turso" "Managed SQLite database hosting." {
                containerInstance commerce.db
            }

            kitchen_site = deploymentNode "Kitchen Site" "On-prem kitchen hardware." {
                pi_host = deploymentNode "Kitchen Raspberry Pi" "On-prem Raspberry Pi running the relay process." "Raspberry Pi OS (Linux)" {
                    relay_instance = containerInstance kitchen.relay
                }

                usb_printer = infrastructureNode "Kitchen Printer" "Dedicated USB thermal ticket printer physically connected to the Raspberry Pi." "Thermal/Receipt Printer (USB)"

                pi_host.relay_instance -> usb_printer "Send kitchen ticket text via CUPS/lp over USB"
            }

            deploymentNode "Stripe Cloud" "Stripe-managed payment platform runtime." {
                softwareSystemInstance stripe
            }

            deploymentNode "Helius Cloud" "Helius-managed Solana data and RPC runtime." {
                softwareSystemInstance helius
            }
        }
    }


    views {
        !script groovy {
            workspace.views.createDefaultViews()
        }

        deployment * "Production" {
            include *
        }

        styles {
            element "Unused" {
                border dashed
                // background #000000
                // stroke #e5e5e5
            }

            element "Element" {
                color #4699eb
                stroke #4699eb
                shape roundedbox
                strokeWidth 5

            }

            element "External System" {
                background #373837
                color #cbcbcb
                stroke #cbcbcb
                shape roundedbox
            }
            element "Database" {
                shape cylinder
            }
            element "Boundary" {
                strokeWidth 3
            }
            element "Web Browser" {
                shape WebBrowser
            }
            element "Component" {
                shape component
                color #4699eb
                stroke #4699eb
            }
            relationship "Relationship" {
                thickness 2
            }
            dark {
                element "Person" {
                    shape person
                    stroke #cbcbcb
                    color #cbcbcb
                }
            }
            light {
                element "Person" {
                    shape person
                    stroke #cbcbcb
                    color #cbcbcb
                }
            }
        }
    }
}