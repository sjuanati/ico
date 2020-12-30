const ICO = artifacts.require("ICO.sol");

module.exports = function (deployer) {
    deployer.deploy(ICO, 'SJS Token', 'SJS', 18, web3.utils.toWei('1000'));
};
