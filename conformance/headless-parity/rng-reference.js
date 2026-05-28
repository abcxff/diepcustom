class SplitMix64Reference {
  constructor(seed = 1n) {
    this.state = seed === 0n ? 0x9E3779B97F4A7C15n : BigInt(seed);
    this.draws = 0;
  }

  nextU32() {
    const mask = (1n << 64n) - 1n;
    this.state = (this.state + 0x9E3779B97F4A7C15n) & mask;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & mask;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & mask;
    z = z ^ (z >> 31n);
    this.draws += 1;
    return Number((z >> 32n) & 0xffffffffn);
  }

  random() {
    return this.nextU32() / 4294967296;
  }

  install() {
    const previous = Math.random;
    Math.random = () => this.random();
    return () => { Math.random = previous; };
  }
}

function withSeededRandom(seed, fn) {
  const rng = new SplitMix64Reference(BigInt(seed));
  const restore = rng.install();
  try {
    return fn(rng);
  } finally {
    restore();
  }
}

module.exports = { SplitMix64Reference, withSeededRandom };
