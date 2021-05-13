#!/bin/bash
#chmod u+x this_script.sh
echo "inside preGitAdd.sh ..."
echo "..."

echo ""
echo "swap smart contracts..."
echo "move TokenGeyser to archives"
mv contracts/TokenGeyser.sol contractsT1/
echo "move TokenGeyser from archives"
mv contractsT1/TokenGeyserT1.sol contracts/

echo "moving files has been completed"
