#!/bin/sh

NODES_JSON="/var/www/data/nodes.json"

# Wait for DNS to be ready
sleep 3

# Resolve IPs for nodeodm, filter out loopback
NODES=$(nslookup nodeodm 2>/dev/null | awk '/^Address: / { print $2 }' | grep -v '^127\.')

# Build JSON array
{
    echo "["
    COUNT=0
    for NODE in $NODES; do
        # Attempt reverse DNS; fallback to IP
        HOSTNAME=$(nslookup "$NODE" 2>/dev/null | awk '/name =/ { print $4 }' | sed 's/\.$//')
        [ -z "$HOSTNAME" ] && HOSTNAME="$NODE"

        # Add comma only after the first item
        [ $COUNT -gt 0 ] && echo ","

        # Print JSON object
        echo "  { \"hostname\": \"$HOSTNAME\", \"port\": \"3000\", \"token\": \"\" }"

        COUNT=$((COUNT + 1))
    done
    echo "]"
} > "$NODES_JSON"

# Output the result
echo "Generated nodes.json:"
cat "$NODES_JSON"
echo "Continuing with ClusterODM startup"
