# Research: the physics behind The Key

_Build session 2, 2026-10-16. Every value was checked against its source on that date (NIST pages
fetched live; the copper data from the Copper Development Association's alloy page). Used by
`src/chapters/key/physics.ts` and its tests (`src/chapters/key/key.test.ts`). The hydrogen hyperfine
line itself is in `clocks.md` section 5._

## 1. Fundamental constants (CODATA 2022, NIST)

| Quantity | Value | Source |
|---|---|---|
| Rydberg constant R_inf | 10,973,731.568157(12) m^-1 | NIST CODATA 2022, https://physics.nist.gov/cgi-bin/cuu/Value?ryd |
| Electron to proton mass ratio m_e/m_p | 5.446170214889(94)e-4 | NIST CODATA 2022, https://physics.nist.gov/cgi-bin/cuu/Value?mesmp |
| Fine-structure constant alpha | 7.2973525643(11)e-3 | NIST CODATA 2022, https://physics.nist.gov/cgi-bin/cuu/Value?alph |
| h, c, e | exact in the 2019 SI | same NIST pages |

Correction: the first build used CODATA 2018 values from memory (R_inf ...568160, m_e/m_p ...21487,
alpha ...5693). They differ from CODATA 2022 by at most 7e-10 relative, which changes nothing the game
shows; the code now uses the 2022 values above.

**How they are used.** Hydrogen's Bohr transition frequencies: f = R_H c (1/n1^2 - 1/n2^2), with
R_H = R_inf / (1 + m_e/m_p) = 10,967,758.34 m^-1. Bohr levels leave out fine structure and the Lamb
shift, of order alpha^2 = 5.3e-5 relative; that is the tolerance of the atlas test.

## 2. Hydrogen lines (NIST Atomic Spectra Database)

Vacuum wavelengths of H I, the unresolved lines between principal levels (the rows whose levels are
given only as n), fetched with "Vacuum (all wavelengths)" from the ASD lines form,
https://physics.nist.gov/PhysRefData/ASD/lines_form.html (query: spectra = H I).

| Line | Levels | Observed (vacuum) | Ritz (vacuum) | Bohr formula (ours) | Difference |
|---|---|---|---|---|---|
| Lyman-alpha | 1 to 2 | 121.56701 nm | 121.56701 nm | 121.5684 nm | 1.2e-5 |
| H-alpha (Balmer-alpha) | 2 to 3 | 656.460 nm | 656.4632 nm | 656.4696 nm | 9.8e-6 |
| Paschen-alpha | 3 to 4 | 1875.64 nm | 1875.6096 nm | 1875.6274 nm | 9.5e-6 |
| Ionization limit | 1 to free | | | 91.1763 nm | 1.1e-5 |

Ionization energy of H I: 13.598434599702(12) eV (NIST ASD ionization energies,
https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html), so lambda = hc / E = 91.17534 nm.

Correction: the first build's test values from memory were H-alpha 656.461 nm and Paschen-alpha
1875.61 nm; the tests now use the Ritz values above (the Lyman-alpha and ionization values matched).

## 3. A copper disc spinning: how fast before it bursts

The record is a 12-inch gold-plated copper disc (`voyager.md` "Record"). The Key compares the disc's rim
speed, under each candidate unit, with the fastest a copper disc survives.

**Stress in a rotating disc.** For a solid disc of uniform thickness, radius b, density rho, Poisson's
ratio nu, turning at omega, the radial and hoop stresses are largest at the centre and equal
sigma_max = (3 + nu)/8 x rho x omega^2 x b^2 = (3 + nu)/8 x rho x v^2, with v the rim speed.
Source: S. P. Timoshenko and J. N. Goodier, Theory of Elasticity, 3rd ed. (McGraw-Hill, 1970), the
rotating-disc solution (cited at p. 80 by the SolidWorks verification problem
https://help.solidworks.com/2025/English/simconntutorial/Rotating_Solid_Disk.htm); derivations that give
the same result: https://www.codecogs.com/page/1226/v/3536 and arXiv:2005.14634 (equation for the
radial stress, (3 + nu)/8 rho omega^2 (R^2 - r^2)). The disc bursts when sigma_max reaches the tensile
strength, so v_burst = sqrt(8 sigma / ((3 + nu) rho)), independent of the disc's size.

**Copper (oxygen-free and electrolytic tough pitch copper, UNS C11000).** Copper Development
Association alloy page, https://alloys.copper.org/alloy/C11000 (read 2026-10-16):

| Property | Value | Used |
|---|---|---|
| Tensile strength, annealed (temper OS050, typical) | 32 ksi (OS025: 34 ksi) | 32 ksi = 220.6 MPa (the weaker annealed temper) |
| Specific gravity | 8.91 | density 8,910 kg/m^3 |
| Modulus of elasticity in tension | 17,000 ksi | Poisson's ratio from the two moduli, |
| Modulus of rigidity | 6,400 ksi | nu = E / (2G) - 1 = 0.328 |

Result: v_burst = sqrt(8 x 220.6e6 / (3.328 x 8,910)) = 244.0 m/s.

Correction: the first build used 220 MPa, 8,960 kg/m^3 and nu = 0.34 from memory (burst 242.5 m/s).
The CDA values above replace them; the change is under 1% and alters no verdict (the hydrogen
spin-flip reading turns the rim at 0.27 m/s; every other transition exceeds the burst speed by 130 to
2,600 times).

**Caveats.** The real disc is gold-plated copper and has a centre hole; a hole doubles the peak hoop
stress at its edge, which only lowers the burst speed and strengthens the conclusion. The game's
threshold is a factor of hundreds from every wrong reading, so the exact alloy temper does not matter.

## 4. The disc and the craft (from the model)

The disc in the alien's hand: radius 0.157 m (`public/media/models/voyager.json`, recordDisc). The
craft's largest extent: 16.9 m along the magnetometer boom (the same file's extents; `voyager.md`
section 2: magnetometer boom 13 m). A length reading is called absurd at 1,000 times the craft or more
(a stated game criterion, three orders of magnitude).
