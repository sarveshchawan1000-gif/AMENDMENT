"""Tests for board.py — snake-path layout and prime check."""

from engine.board import tile_to_coord, is_prime


class TestTileToCoord:
    """Snake-path tile → (row, col) conversion."""

    def test_snake_path_row0_left_to_right(self):
        """Row 0 goes left→right: tiles 1,2,3 → cols 0,1,2."""
        assert tile_to_coord(1, 3) == (0, 0)
        assert tile_to_coord(2, 3) == (0, 1)
        assert tile_to_coord(3, 3) == (0, 2)

    def test_snake_path_row1_right_to_left(self):
        """Row 1 goes right→left: tiles 4,5,6 → cols 2,1,0."""
        assert tile_to_coord(4, 3) == (1, 2)
        assert tile_to_coord(5, 3) == (1, 1)
        assert tile_to_coord(6, 3) == (1, 0)

    def test_snake_path_row2_left_to_right(self):
        """Row 2 goes left→right again."""
        assert tile_to_coord(7, 3) == (2, 0)
        assert tile_to_coord(8, 3) == (2, 1)
        assert tile_to_coord(9, 3) == (2, 2)

    def test_6x6_board(self):
        """Verify a few tiles on a 6×6 board (36 tiles)."""
        assert tile_to_coord(1, 6) == (0, 0)
        assert tile_to_coord(6, 6) == (0, 5)
        assert tile_to_coord(7, 6) == (1, 5)   # row 1 reverses
        assert tile_to_coord(12, 6) == (1, 0)
        assert tile_to_coord(36, 6) == (5, 0)  # last tile, row 5 reverses


class TestIsPrime:
    """Prime number check."""

    def test_primes(self):
        for p in [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]:
            assert is_prime(p), f"{p} should be prime"

    def test_non_primes(self):
        for n in [0, 1, 4, 6, 8, 9, 10, 12, 15, 20, 36, 100]:
            assert not is_prime(n), f"{n} should not be prime"
