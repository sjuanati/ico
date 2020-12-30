const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ICO = artifacts.require('ICO.sol');
const Token = artifacts.require('ERC20Token.sol');

contract('ICO', accounts => {
    let ico;
    let token;
    const name = 'SJS Tokens';
    const symbol = 'SJS';
    const decimals = 18;
    const initialBalance = web3.utils.toBN(web3.utils.toWei('1000'));

    beforeEach(async () => {
        ico = await ICO.new(name, symbol, decimals, initialBalance);
        const tokenAddress = await ico.token();
        token = await Token.at(tokenAddress);
    });

    it('should create an erc20 token', async () => {
        const _name = await token.name();
        const _symbol = await token.symbol();
        const _decimals = await token.decimals();
        const _totalSupply = await token.totalSupply();

        assert(_name === name);
        assert(_symbol === symbol);
        assert(_decimals.toNumber() === decimals);
        assert(_totalSupply.eq(initialBalance));
    });

    it('should start the ICO', async () => {
        const duration = 100;
        const price = 1;
        const available = web3.utils.toWei('100');
        const minPurchase = web3.utils.toWei('10');
        const maxPurchase = web3.utils.toWei('20');
        const start = parseInt((new Date()).getTime() / 1000); // miliseconds / 1000 = seconds
        const end = start + duration;

        await ico.start(duration, price, available, minPurchase, maxPurchase);

        const actualEnd = await ico.end();
        const actualPrice = await ico.price();
        const actualAvailable = await ico.available();
        const ActualMinPurchase = await ico.minPurchase();
        const ActualMaxPurchase = await ico.maxPurchase();

        assert(actualEnd.eq(web3.utils.toBN(end)));
        assert(actualPrice.eq(web3.utils.toBN(price)));
        assert(actualAvailable.eq(web3.utils.toBN(available)))
        assert(ActualMinPurchase.eq(web3.utils.toBN(minPurchase)))
        assert(ActualMaxPurchase.eq(web3.utils.toBN(maxPurchase)))

    });

    it('should NOT start the ICO', async () => {
        const duration = 100;
        const price = 1;
        const available = web3.utils.toWei('10000');
        const minPurchase = web3.utils.toWei('10');
        const maxPurchase = web3.utils.toWei('20');
        const start = parseInt((new Date()).getTime() / 1000); // miliseconds / 1000 = seconds
        const end = start + duration;

        // const bal = await token.totalSupply();
        // console.log('erc', bal.toString());
        // console.log('ico', available);

        await expectRevert(
            ico.start(duration, price, available, minPurchase, maxPurchase),
            'totalSupply should be > 0 and <= totalSupply'
        );

        const newAvailable = web3.utils.toWei('500');
        const newMaxPurchase = web3.utils.toWei('600');

        await expectRevert(
            ico.start(duration, price, newAvailable, minPurchase, newMaxPurchase),
            'maxPurchase should be > 0 and <= availableTokens'
        );
    });

    context('Sale started', () => {
        let start;
        const duration = 100;
        const price = 2;
        const availableTokens = web3.utils.toWei('30');
        const minPurchase = web3.utils.toWei('1');
        const maxPurchase = web3.utils.toWei('10');
        const investor = accounts[0];

        beforeEach(async () => {
            start = parseInt((new Date()).getTime() / 1000);
            time.increaseTo(start);
            ico.start(duration, price, availableTokens, minPurchase, maxPurchase);
        });

        it('should NOT let non-investors buy', async () => {
            await expectRevert(
                ico.buy(),
                'only investors'
            );
        });

        // ** TODO: to be reviewed **
        // it('should NOT buy non-multiple of price', async () => {
        //     await ico.whitelist(investor);
        //     //const value = web3.utils.toBN(web3.utils.toWei('7'));
        //     const value = web3.utils.toWei('7');
        //     await expectRevert(
        //         ico.buy({from: investor, value: value}),
        //         'have to send a multiple of price'
        //     );
        // });

        it('should NOT buy if not between min and max purchase', async () => {
            await ico.whitelist(investor);
            const value = web3.utils.toBN(web3.utils.toWei('11'));
            await expectRevert(
                ico.buy({ from: investor, value: value }),
                'have to send between minPurchase and maxPurchase'
            );
        });

        it('should NOT buy if not enough tokens left', async () => {
            await ico.whitelist(investor);
            // const icoAvailable = await ico.available();
            // console.log('ava', icoAvailable.toString());
            // console.log('pur', web3.utils.toWei('10'));
            await ico.buy({ from: investor, value: web3.utils.toWei('10') });
            expectRevert(
                ico.buy({ from: investor, value: web3.utils.toWei('10') }),
                'not enough token left for sale'
            );
        });

        it.only('full ico process: investors buy, admin release and withdraw', async () => {
            const [investor1, investor2] = [accounts[1], accounts[2]];
            await ico.whitelist(investor1);
            await ico.whitelist(investor2);
            const [amount1, amount2] = [
                web3.utils.toBN(web3.utils.toWei('1')),
                web3.utils.toBN(web3.utils.toWei('10')),
            ];
            await ico.buy({ from: investor1, value: amount1 });
            await ico.buy({ from: investor2, value: amount2 });

            await expectRevert(
                ico.release({ from: investor1 }),
                'only admin'
            );

            await expectRevert(
                ico.release(),
                'ICO must have ended'
            );

            await expectRevert(
                ico.withdraw(accounts[9], 10),
                'ICO must have ended'
            );

            // Admin releases tokens to investors
            time.increaseTo(start + duration + 10);
            await ico.release();
            const balance1 = await token.balanceOf(investor1);
            const balance2 = await token.balanceOf(investor2);
            assert(balance1.eq(amount1.mul(web3.utils.toBN(price))));
            assert(balance2.eq(amount2.mul(web3.utils.toBN(price))));

            await expectRevert(
                ico.withdraw(accounts[9], 10, { from: investor1 }),
                'only admin'
            );

            // Admin withdraws ether that was sent to the ico
            const balanceContract = web3.utils.toBN(
                await web3.eth.getBalance(token.address)
            );
            const balanceBefore = web3.utils.toBN(
                await web3.eth.getBalance(accounts[9])
            );
            await ico.withdraw(accounts[9], balanceContract);
            const balanceAfter = web3.utils.toBN(
                await web3.eth.getBalance(accounts[9])
            );
            assert(balanceAfter.sub(balanceBefore).eq(balanceContract));

        });
    });
});