workspace "Name" "Description" {

    !identifiers hierarchical

    model {
        c = person "Customer"
        k = person "Kitchen Staff"
        s = person "Storefront Staff"

        kitchen = softwareSystem "Kitchen Relay" {
            relay = container "Relay" "Receives orders from the web API and prints tickets to the kitchen." "Typescript and Node.js" {
                printerAdapter = component "Printer Adapter" "Adapts the printer to the relay." "Typescript and Node.js" 
                cl = component "Console Printer" "Outputs purchase orders to console."
                lp = component "LP Printer" "Outputs purchase orders to OS printer driver."
            }
        }

        printer = element "Kitchen Printer" "Prints tickets to the kitchen."

        commerce = softwareSystem "Online Ordering" {
            admin = container "Admin Panel" "Provides admin functionality to the storefront staff." "Typescript and Next.js" "Web Browser"
            app = container "Web App" "Provides all online ordering functionality to customers via their web browser." "Typescript and Next.js" "Web Browser" {
                stripeCheckout = component "Stripe Checkout" "Handles the checkout process with Stripe." "Typescript and Next.js"
                solanaPayCheckout = component "Solana Pay Checkout" "Handles the checkout process with Solana Pay." "Typescript and Next.js"
            }
            api = container "Web API" "Provides backend services for the web app." "Typescript and Next.js" "Web API" {
                solanaPoller = component "Solana Poller" "Polls for Solana transactions to update the database." "Typescript and Node.js"
                stripeHandler = component "Stripe Handler" "Handles Stripe webhooks to update the database." "Typescript and Node.js"
                ackHandler = component "Ack Handler" "Handles ticket printing confirmation" "Typescript and Node.js"
                updateOrderHandler = component "Update Order Handler" "Handles updating orders" "Typescript and Node.js"
            }
        }
        turso = softwareSystem "Turso" "Hosted database service" "External System" {
            db = container "Database" "Stores all data for the online ordering system." "SQL" "Database"
        }        
        
        stripe = softwareSystem "Stripe" "Stripe's payment processing system" "External System"
        helius = softwareSystem "Helius" "Solana network services" "External System"
    
    
        kitchen.relay.lp -> printer "Sends printing job"
        kitchen.relay -> commerce.api.ackHandler "Confirm successful ticket print"
        commerce.api.solanaPoller -> helius "Polls pending order references"
        commerce.api -> kitchen.relay "Sends order.paid event"
        commerce.admin -> commerce.api.updateOrderHandler "Updates orders"
        commerce.admin -> turso.db "update menu version"
        commerce.app -> commerce.api "Request order reference"
        commerce.app.stripeCheckout -> stripe "Submit Stripe transaction"
        commerce.app.solanaPayCheckout -> helius "Submit Solana Pay transaction"
        stripe -> commerce.api.stripeHandler "Announce order reference is paid"

        // TODO: create an order record expiration mechanism. Don't rely on solanapoller.
        commerce.api.stripeHandler -> turso.db "create/update order record"
        commerce.api.solanaPoller -> turso.db "create/update/expire order record"

        // Person relationships
        c -> commerce.app "Orders from the web app"
        k -> printer "Takes printed kitchen orders"
        s -> commerce.admin "Finalize/Refund orders"

        // Higher-level relationship abstractions
        # commerce -> turso "Track order lifecycle and menu versions"
    }


    views {
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