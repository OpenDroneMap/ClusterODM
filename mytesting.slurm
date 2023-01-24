#!/usr/bin/bash
#source .bashrc

#SBATCH --partition=8core
#SBATCH --nodelist=node[48,50,51]
#SBATCH --time=20:00:00

cd $HOME
cd ODM/NodeODM/

#Launched on Node 48
srun --nodes=1 apptainer run --writable node/ &

#Launch on node 50
srun --nodes=1 apptainer run --writable node/ &

#Launch on node 51
srun --nodes=1 apptainer run --writable node/ &
wait
