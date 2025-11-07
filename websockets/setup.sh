#!/bin/bash
# Project-specific env for libwebsockets (local install)
export PKG_CONFIG_PATH=/home/malciller/dev/c_stuf/websockets/libwebsockets-install/lib/pkgconfig:$PKG_CONFIG_PATH
export LD_LIBRARY_PATH=/home/malciller/dev/c_stuf/websockets/libwebsockets-install/lib:$LD_LIBRARY_PATH
echo "Env set! Now you can compile/run without path issues."