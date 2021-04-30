pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(uint256 _totalSupply) ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, _totalSupply);
    }
}
