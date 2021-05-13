#!/bin/bash
#chmod u+x this_script.sh
echo "inside postGit.sh ..."
echo "..."

echo ""
echo "swap smart contracts..."
echo "move TokenGeyserT1 to archives"
mv contracts/TokenGeyserT1.sol contractsT1/
echo "move TokenGeyser from archives"
mv contractsT1/TokenGeyser.sol contracts/

echo "moving files has been completed"
