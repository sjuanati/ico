// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/* ICO mechanism:
 * - ICO crowdsale contract: collect the investments and coordinate the transfers of ERC20 tokens
 * - ERC20 token contract
 * Steps:
 * 1) Investors send ETH to ICO contract. This ETH will represent the % of investment
 * 2) ICO contract transfers tokens to investors depending on pre-established price of tokens x ETH
 * Each investor has a cost (KYC..), so a min investment amount is required to cover this cost
 * Also recommended to have max investment amount to diversify (avoid whale with overpower, regulation rules)
 */

interface ERC20Interface {
    function transfer(address to, uint256 tokens)
        external
        returns (bool success);

    function transferFrom(
        address from,
        address to,
        uint256 tokens
    ) external returns (bool success);

    function balanceOf(address tokenOwner)
        external
        view
        returns (uint256 balance);

    function approve(address spender, uint256 tokens)
        external
        returns (bool success);

    function allowance(address tokenOwner, address spender)
        external
        view
        returns (uint256 remaining);

    //function totalSupply() external view returns (uint);

    event Transfer(address indexed from, address indexed to, uint256 tokens);
    event Approval(
        address indexed tokenOwner,
        address indexed spender,
        uint256 tokens
    );
}

contract ERC20Token is ERC20Interface {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowed;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _totalSupply
    ) public {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        totalSupply = _totalSupply;
        balances[msg.sender] = _totalSupply;
    }

    function transfer(address to, uint256 value)
        public
        override
        returns (bool)
    {
        require(balances[msg.sender] >= value);
        balances[msg.sender] -= value;
        balances[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public override returns (bool) {
        uint256 allowance = allowed[from][msg.sender];
        require(balances[msg.sender] >= value && allowance >= value);
        allowed[from][msg.sender] -= value;
        balances[msg.sender] -= value;
        balances[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value)
        public
        override
        returns (bool)
    {
        require(spender != msg.sender);
        allowed[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function allowance(address owner, address spender)
        public
        view
        override
        returns (uint256)
    {
        return allowed[owner][spender];
    }

    function balanceOf(address owner) public view override returns (uint256) {
        return balances[owner];
    }
}

contract ICO {
    struct Sale {
        address investor;
        uint256 quantity;
    }
    Sale[] public sales;
    mapping(address => bool) public investors;
    address public token;
    address public admin;
    uint256 public end; // end of the ICO
    uint256 public price; // price of the ICO (tokens x ETH)
    uint256 public available; // some tokens can be reserved for founders, pre-sale, etc
    uint256 public minPurchase;
    uint256 public maxPurchase;
    bool public released;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _totalSupply
    ) public {
        token = address(
            new ERC20Token(_name, _symbol, _decimals, _totalSupply)
        ); // creates new smart contract
        admin = msg.sender;
    }

    function start(
        uint256 duration,
        uint256 _price,
        uint256 _availableTokens,
        uint256 _minPurchase,
        uint256 _maxPurchase
    ) external onlyAdmin() icoNotActive() {
        require(duration > 0, "duration should be > 0");
        uint256 totalSupply = ERC20Token(token).totalSupply(); // retrieves existing smart contract
        require(
            _availableTokens > 0 && _availableTokens <= totalSupply,
            "totalSupply should be > 0 and <= totalSupply"
        );
        require(_minPurchase > 0, "_minPurchase should be > 0");
        require(
            _maxPurchase > 0 && _maxPurchase <= _availableTokens,
            "maxPurchase should be > 0 and <= availableTokens"
        );
        end = duration + block.timestamp;
        price = _price;
        available = _availableTokens;
        minPurchase = _minPurchase;
        maxPurchase = _maxPurchase;
    }

    function whitelist(address investor) external onlyAdmin() {
        investors[investor] = true;
    }

    // Tokens shouldn't be transferred to investors until ICO is finished; otherwise, they can trade already with them and change it's default value.
    function buy() external payable onlyInvestors() icoActive() {
        require(msg.value % price == 0, "have to send a multiple of price"); // ensure it is multiple of the ICO price (to avoid ETH leftover)
        require(
            msg.value >= minPurchase && msg.value <= maxPurchase,
            "have to send between minPurchase and maxPurchase"
        );
        uint256 quantity = price * msg.value; // price (token x ether) * value (ether)
        require(quantity <= available, "not enough token left for sale");
        sales.push(Sale(msg.sender, quantity));
    }

    function release() external onlyAdmin() icoEnded() tokensNotReleased() {
        ERC20Token tokenInstance = ERC20Token(token);
        for (uint256 i = 0; i < sales.length; i++) {
            Sale storage sale = sales[i];
            tokenInstance.transfer(sale.investor, sale.quantity);
        }
    }

    function withdraw(address payable to, uint256 amount)
        external
        onlyAdmin()
        icoEnded()
        tokensReleased()
    {
        to.transfer(amount);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    modifier onlyInvestors() {
        require(investors[msg.sender] == true, "only investors");
        _;
    }

    modifier icoNotActive() {
        require(end == 0, "ICO should not be active");
        _;
    }

    modifier icoActive() {
        require(
            end > 0 && block.timestamp < end && available > 0,
            "ICO must be active"
        );
        _;
    }

    modifier icoEnded() {
        require(
            end > 0 && (block.timestamp >= end || available == 0),
            "ICO must have ended"
        );
        _;
    }

    modifier tokensReleased() {
        require(released == true, "tokens must have been released");
        _;
    }

    modifier tokensNotReleased() {
        require(released == false, "tokens must NOT have been released");
        _;
    }
}
